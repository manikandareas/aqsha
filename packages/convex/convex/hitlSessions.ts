import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireCurrentUser } from "./auth";
import {
  excludeAnswersForCardIds,
  formatAnswersForPrompt,
  hasPendingQuestions,
  parseAnswersJson,
  planReviewActionable,
  resolveActiveCardId,
} from "./hitlSessionLogic";
import { assertDocumentWorkspaceArtifact, resolveWorkspaceTarget } from "./hitlWorkspace";
import { assertWorkspaceOwner, normalizeName } from "./workspaceAccess";

const hitlPhaseValidator = v.union(
  v.literal("clarifying"),
  v.literal("plan_review"),
  v.literal("executing"),
  v.literal("completed"),
  v.literal("cancelled"),
);

const hitlCardKindValidator = v.union(
  v.literal("question"),
  v.literal("plan_review"),
  v.literal("confirmation"),
);

const hitlCardStatusValidator = v.union(
  v.literal("pending"),
  v.literal("answered"),
  v.literal("skipped"),
  v.literal("approved"),
  v.literal("rejected"),
);

const hitlSourceKindValidator = v.union(
  v.literal("artifact"),
  v.literal("deep_research"),
  v.literal("generic"),
);

const hitlOptionValidator = v.object({
  id: v.string(),
  label: v.string(),
});

const activePhases = new Set(["clarifying", "plan_review"]);

async function findActiveSessionForThread(
  ctx: QueryCtx | MutationCtx,
  ownerUserId: string,
  threadId: string,
) {
  for (const phase of ["clarifying", "plan_review"] as const) {
    const session = await ctx.db
      .query("hitlSessions")
      .withIndex("by_owner_thread_phase_created", (q) =>
        q.eq("ownerUserId", ownerUserId).eq("threadId", threadId).eq("phase", phase),
      )
      .order("desc")
      .first();
    if (session) {
      return session;
    }
  }
  return null;
}

async function assertNoConflictingActiveSession(
  ctx: MutationCtx,
  ownerUserId: string,
  threadId: string,
  promptMessageId: string,
) {
  const active = await findActiveSessionForThread(ctx, ownerUserId, threadId);
  if (active && active.promptMessageId !== promptMessageId) {
    throw new ConvexError(
      "Selesaikan atau batalkan langkah HITL yang sedang berjalan terlebih dahulu.",
    );
  }
}

async function cancelSessionsForPrompt(
  ctx: MutationCtx,
  ownerUserId: string,
  threadId: string,
  promptMessageId: string,
  now: number,
) {
  for (const phase of ["clarifying", "plan_review"] as const) {
    const sessions = await ctx.db
      .query("hitlSessions")
      .withIndex("by_owner_thread_phase_created", (q) =>
        q.eq("ownerUserId", ownerUserId).eq("threadId", threadId).eq("phase", phase),
      )
      .collect();
    for (const session of sessions) {
      if (session.promptMessageId !== promptMessageId) {
        continue;
      }
      await ctx.db.patch("hitlSessions", session._id, {
        phase: "cancelled",
        resolvedAt: now,
      });
      const cards = await getSessionCards(ctx, session._id);
      for (const card of cards) {
        if (card.status === "pending") {
          await ctx.db.patch("hitlCards", card._id, { status: "rejected" });
        }
      }
    }
  }
}

async function cancelDeepResearchSessionsForRun(
  ctx: MutationCtx,
  ownerUserId: string,
  threadId: string,
  promptMessageId: string,
  runId: Id<"agentRuns">,
  now: number,
) {
  for (const phase of ["clarifying", "plan_review"] as const) {
    const sessions = await ctx.db
      .query("hitlSessions")
      .withIndex("by_owner_thread_phase_created", (q) =>
        q.eq("ownerUserId", ownerUserId).eq("threadId", threadId).eq("phase", phase),
      )
      .collect();
    for (const session of sessions) {
      if (
        session.sourceKind !== "deep_research" ||
        (session.promptMessageId !== promptMessageId && session.runId !== runId)
      ) {
        continue;
      }
      await ctx.db.patch("hitlSessions", session._id, {
        phase: "cancelled",
        resolvedAt: now,
      });
      const cards = await getSessionCards(ctx, session._id);
      for (const card of cards) {
        if (card.status === "pending") {
          await ctx.db.patch("hitlCards", card._id, { status: "rejected" });
        }
      }
    }
  }
}

async function getSessionCards(ctx: QueryCtx | MutationCtx, sessionId: Id<"hitlSessions">) {
  return await ctx.db
    .query("hitlCards")
    .withIndex("by_session_order", (q) => q.eq("sessionId", sessionId))
    .collect();
}

async function getOrCreateSession(
  ctx: MutationCtx,
  args: {
    ownerUserId: string;
    threadId: string;
    promptMessageId: string;
    runId?: Id<"agentRuns">;
    sourceKind: "artifact" | "deep_research" | "generic";
    commandId?: string;
  },
) {
  const existing = await ctx.db
    .query("hitlSessions")
    .withIndex("by_owner_thread_phase_created", (q) =>
      q
        .eq("ownerUserId", args.ownerUserId)
        .eq("threadId", args.threadId)
        .eq("phase", "clarifying"),
    )
    .order("desc")
    .first();
  if (existing && existing.promptMessageId === args.promptMessageId) {
    return existing;
  }

  const planReview = await ctx.db
    .query("hitlSessions")
    .withIndex("by_owner_thread_phase_created", (q) =>
      q
        .eq("ownerUserId", args.ownerUserId)
        .eq("threadId", args.threadId)
        .eq("phase", "plan_review"),
    )
    .order("desc")
    .first();
  if (planReview && planReview.promptMessageId === args.promptMessageId) {
    return planReview;
  }

  const now = Date.now();
  await assertNoConflictingActiveSession(
    ctx,
    args.ownerUserId,
    args.threadId,
    args.promptMessageId,
  );
  await cancelSessionsForPrompt(ctx, args.ownerUserId, args.threadId, args.promptMessageId, now);

  const sessionId = await ctx.db.insert("hitlSessions", {
    ownerUserId: args.ownerUserId,
    threadId: args.threadId,
    promptMessageId: args.promptMessageId,
    runId: args.runId,
    sourceKind: args.sourceKind,
    phase: "clarifying",
    commandId: args.commandId,
    createdAt: now,
  });
  const session = await ctx.db.get("hitlSessions", sessionId);
  if (!session) {
    throw new ConvexError("Failed to create HITL session");
  }
  return session;
}

async function nextCardOrder(ctx: MutationCtx, sessionId: Id<"hitlSessions">) {
  const cards = await getSessionCards(ctx, sessionId);
  return cards.length;
}

export const createQuestionCardsInternal = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    promptMessageId: v.string(),
    runId: v.optional(v.id("agentRuns")),
    commandId: v.optional(v.string()),
    sourceKind: hitlSourceKindValidator,
    questions: v.array(
      v.object({
        prompt: v.string(),
        options: v.array(hitlOptionValidator),
        allowCustom: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const session = await getOrCreateSession(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      promptMessageId: args.promptMessageId,
      runId: args.runId,
      sourceKind: args.sourceKind,
      commandId: args.commandId,
    });
    const now = Date.now();
    let order = await nextCardOrder(ctx, session._id);
    const cardIds: Id<"hitlCards">[] = [];
    for (const question of args.questions) {
      if (question.options.length < 2) {
        throw new ConvexError("Each question needs at least 2 options");
      }
      const cardId = await ctx.db.insert("hitlCards", {
        sessionId: session._id,
        ownerUserId: args.ownerUserId,
        order,
        kind: "question",
        status: "pending",
        prompt: question.prompt,
        optionsJson: JSON.stringify(question.options),
        allowCustom: question.allowCustom ?? true,
        createdAt: now,
      });
      cardIds.push(cardId);
      order += 1;
    }
    await ctx.db.patch("hitlSessions", session._id, { phase: "clarifying" });
    if (args.runId) {
      await ctx.db.patch("agentRuns", args.runId, {
        status: "waiting",
        updatedAt: now,
      });
    }
    return { sessionId: session._id, cardIds };
  },
});

export const createPlanReviewCardInternal = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    promptMessageId: v.string(),
    runId: v.optional(v.id("agentRuns")),
    commandId: v.optional(v.string()),
    sourceKind: hitlSourceKindValidator,
    title: v.string(),
    summary: v.string(),
    planBullets: v.array(v.string()),
    payloadJson: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    if (args.planBullets.length < 1 || args.planBullets.length > 8) {
      throw new ConvexError("Plan must include 1-8 bullet points");
    }
    const session = await getOrCreateSession(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      promptMessageId: args.promptMessageId,
      runId: args.runId,
      sourceKind: args.sourceKind,
      commandId: args.commandId,
    });
    const workspaceTarget = await resolveWorkspaceTarget(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      workspaceId: args.workspaceId,
    });
    const now = Date.now();
    const order = await nextCardOrder(ctx, session._id);
    const cardId = await ctx.db.insert("hitlCards", {
      sessionId: session._id,
      ownerUserId: args.ownerUserId,
      order,
      kind: "plan_review",
      status: "pending",
      title: normalizeName(args.title, "Plan"),
      summary: args.summary,
      planBullets: args.planBullets,
      payloadJson: args.payloadJson,
      requiresWorkspacePick: workspaceTarget.requiresWorkspacePick,
      workspaceId: workspaceTarget.workspaceId,
      createdAt: now,
    });
    await ctx.db.patch("hitlSessions", session._id, {
      phase: "plan_review",
      executionPayloadJson: args.payloadJson,
    });
    if (args.runId) {
      await ctx.db.patch("agentRuns", args.runId, {
        status: "waiting",
        updatedAt: now,
      });
    }
    return { sessionId: session._id, cardId };
  },
});

export const createConfirmationCardInternal = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    promptMessageId: v.string(),
    runId: v.optional(v.id("agentRuns")),
    commandId: v.optional(v.string()),
    sourceKind: hitlSourceKindValidator,
    title: v.string(),
    message: v.string(),
    destructive: v.optional(v.boolean()),
    payloadJson: v.string(),
    workspaceId: v.optional(v.id("workspaces")),
  },
  handler: async (ctx, args) => {
    const session = await getOrCreateSession(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      promptMessageId: args.promptMessageId,
      runId: args.runId,
      sourceKind: args.sourceKind,
      commandId: args.commandId,
    });
    const workspaceTarget = await resolveWorkspaceTarget(ctx, {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      workspaceId: args.workspaceId,
    });
    const now = Date.now();
    const order = await nextCardOrder(ctx, session._id);
    const cardId = await ctx.db.insert("hitlCards", {
      sessionId: session._id,
      ownerUserId: args.ownerUserId,
      order,
      kind: "confirmation",
      status: "pending",
      title: normalizeName(args.title, "Confirm"),
      message: args.message,
      destructive: args.destructive ?? true,
      payloadJson: args.payloadJson,
      requiresWorkspacePick: workspaceTarget.requiresWorkspacePick,
      workspaceId: workspaceTarget.workspaceId,
      createdAt: now,
    });
    await ctx.db.patch("hitlSessions", session._id, {
      phase: "plan_review",
      executionPayloadJson: args.payloadJson,
    });
    if (args.runId) {
      await ctx.db.patch("agentRuns", args.runId, {
        status: "waiting",
        updatedAt: now,
      });
    }
    return { sessionId: session._id, cardId };
  },
});

export const createDeepResearchPlanCardInternal = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    promptMessageId: v.string(),
    runId: v.id("agentRuns"),
    title: v.string(),
    summary: v.string(),
    planBullets: v.array(v.string()),
    payloadJson: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await assertNoConflictingActiveSession(
      ctx,
      args.ownerUserId,
      args.threadId,
      args.promptMessageId,
    );
    await cancelDeepResearchSessionsForRun(
      ctx,
      args.ownerUserId,
      args.threadId,
      args.promptMessageId,
      args.runId,
      now,
    );
    const sessionId = await ctx.db.insert("hitlSessions", {
      ownerUserId: args.ownerUserId,
      threadId: args.threadId,
      promptMessageId: args.promptMessageId,
      runId: args.runId,
      sourceKind: "deep_research",
      phase: "plan_review",
      commandId: "deep-research",
      executionPayloadJson: args.payloadJson,
      createdAt: now,
    });
    const cardId = await ctx.db.insert("hitlCards", {
      sessionId,
      ownerUserId: args.ownerUserId,
      order: 0,
      kind: "plan_review",
      status: "pending",
      title: args.title,
      summary: args.summary,
      planBullets: args.planBullets,
      payloadJson: args.payloadJson,
      requiresWorkspacePick: false,
      createdAt: now,
    });
    await ctx.db.patch("agentRuns", args.runId, {
      status: "waiting",
      updatedAt: now,
    });
    return { sessionId, cardId };
  },
});

export const attachAssistantMessageInternal = internalMutation({
  args: {
    ownerUserId: v.string(),
    threadId: v.string(),
    promptMessageId: v.string(),
    assistantMessageId: v.string(),
  },
  handler: async (ctx, args) => {
    for (const phase of ["clarifying", "plan_review"] as const) {
      const session = await ctx.db
        .query("hitlSessions")
        .withIndex("by_owner_thread_phase_created", (q) =>
          q
            .eq("ownerUserId", args.ownerUserId)
            .eq("threadId", args.threadId)
            .eq("phase", phase),
        )
        .order("desc")
        .first();
      if (session && session.promptMessageId === args.promptMessageId) {
        await ctx.db.patch("hitlSessions", session._id, {
          assistantMessageId: args.assistantMessageId,
        });
        return { ok: true as const, sessionId: session._id };
      }
    }
    return { ok: false as const };
  },
});

const cardReturnValidator = v.object({
  _id: v.id("hitlCards"),
  order: v.number(),
  kind: hitlCardKindValidator,
  status: hitlCardStatusValidator,
  prompt: v.optional(v.string()),
  options: v.optional(v.array(hitlOptionValidator)),
  selectedOptionIds: v.optional(v.array(v.string())),
  customAnswer: v.optional(v.string()),
  allowCustom: v.optional(v.boolean()),
  title: v.optional(v.string()),
  summary: v.optional(v.string()),
  planBullets: v.optional(v.array(v.string())),
  message: v.optional(v.string()),
  destructive: v.optional(v.boolean()),
  requiresWorkspacePick: v.optional(v.boolean()),
  workspaceId: v.optional(v.id("workspaces")),
  workspaceName: v.optional(v.string()),
});

export const getActiveForThread = query({
  args: { threadId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("hitlSessions"),
      phase: hitlPhaseValidator,
      sourceKind: hitlSourceKindValidator,
      commandId: v.optional(v.string()),
      runId: v.optional(v.id("agentRuns")),
      cards: v.array(cardReturnValidator),
      activeCardId: v.optional(v.id("hitlCards")),
      blocksComposer: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    let session: Doc<"hitlSessions"> | null = null;
    for (const phase of ["clarifying", "plan_review"] as const) {
      const candidate = await ctx.db
        .query("hitlSessions")
        .withIndex("by_owner_thread_phase_created", (q) =>
          q.eq("ownerUserId", user._id).eq("threadId", args.threadId).eq("phase", phase),
        )
        .order("desc")
        .first();
      if (candidate) {
        session = candidate;
        break;
      }
    }
    if (!session) {
      return null;
    }
    const cards = await getSessionCards(ctx, session._id);
    const mappedCards = await Promise.all(
      cards.map(async (card) => {
        const workspace = card.workspaceId
          ? await ctx.db.get("workspaces", card.workspaceId)
          : null;
        return {
          _id: card._id,
          order: card.order,
          kind: card.kind,
          status: card.status,
          prompt: card.prompt,
          options: card.optionsJson
            ? (JSON.parse(card.optionsJson) as Array<{ id: string; label: string }>)
            : undefined,
          selectedOptionIds: card.selectedOptionIds,
          customAnswer: card.customAnswer,
          allowCustom: card.allowCustom,
          title: card.title,
          summary: card.summary,
          planBullets: card.planBullets,
          message: card.message,
          destructive: card.destructive,
          requiresWorkspacePick: card.requiresWorkspacePick,
          workspaceId: card.workspaceId,
          workspaceName: workspace?.name,
        };
      }),
    );
    const activeCardId = resolveActiveCardId(mappedCards);
    return {
      _id: session._id,
      phase: session.phase,
      sourceKind: session.sourceKind,
      commandId: session.commandId,
      runId: session.runId,
      cards: mappedCards,
      activeCardId,
      blocksComposer: Boolean(activeCardId),
    };
  },
});

export const answerQuestion = mutation({
  args: {
    cardId: v.id("hitlCards"),
    selectedOptionIds: v.optional(v.array(v.string())),
    customAnswer: v.optional(v.string()),
    skip: v.optional(v.boolean()),
  },
  returns: v.object({
    ok: v.literal(true),
    sessionId: v.id("hitlSessions"),
    shouldContinue: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const card = await ctx.db.get("hitlCards", args.cardId);
    if (!card || card.ownerUserId !== user._id) {
      throw new ConvexError("Question not found");
    }
    if (card.kind !== "question") {
      throw new ConvexError("Card is not a question");
    }
    if (card.status !== "pending") {
      throw new ConvexError("Question is no longer pending");
    }
    const session = await ctx.db.get("hitlSessions", card.sessionId);
    if (!session || session.ownerUserId !== user._id) {
      throw new ConvexError("Session not found");
    }
    if (!activePhases.has(session.phase)) {
      throw new ConvexError("Session is no longer active");
    }

    const skipped = args.skip === true;
    if (!skipped && !args.selectedOptionIds?.length && !args.customAnswer?.trim()) {
      throw new ConvexError("Select an option or provide a custom answer");
    }

    await ctx.db.patch("hitlCards", card._id, {
      status: skipped ? "skipped" : "answered",
      selectedOptionIds: args.selectedOptionIds,
      customAnswer: args.customAnswer?.trim(),
    });

    const answers = parseAnswersJson(session.answersJson);
    answers.push({
      cardId: card._id,
      prompt: card.prompt ?? "",
      selectedOptionIds: args.selectedOptionIds,
      customAnswer: args.customAnswer?.trim(),
      skipped,
    });
    await ctx.db.patch("hitlSessions", session._id, {
      answersJson: JSON.stringify(answers),
    });

    const cards = await getSessionCards(ctx, session._id);
    const shouldContinue = !hasPendingQuestions(cards);

    if (shouldContinue) {
      await ctx.scheduler.runAfter(0, internal.hitlSessions.continueAfterAnswers, {
        sessionId: session._id,
        ownerUserId: user._id,
      });
    }

    return { ok: true as const, sessionId: session._id, shouldContinue };
  },
});

export const goBackToPreviousQuestion = mutation({
  args: {
    cardId: v.id("hitlCards"),
  },
  returns: v.object({
    ok: v.literal(true),
    sessionId: v.id("hitlSessions"),
  }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const card = await ctx.db.get("hitlCards", args.cardId);
    if (!card || card.ownerUserId !== user._id) {
      throw new ConvexError("Question not found");
    }
    if (card.kind !== "question") {
      throw new ConvexError("Card is not a question");
    }
    if (card.status !== "pending") {
      throw new ConvexError("Question is no longer pending");
    }
    const session = await ctx.db.get("hitlSessions", card.sessionId);
    if (!session || session.ownerUserId !== user._id) {
      throw new ConvexError("Session not found");
    }
    if (!activePhases.has(session.phase)) {
      throw new ConvexError("Session is no longer active");
    }

    const cards = await getSessionCards(ctx, session._id);
    const questionCards = cards
      .filter((row) => row.kind === "question")
      .sort((a, b) => a.order - b.order);
    const currentIndex = questionCards.findIndex((row) => row._id === card._id);
    if (currentIndex <= 0) {
      throw new ConvexError("No previous question");
    }
    const previousQuestion = questionCards[currentIndex - 1];
    if (previousQuestion.status !== "answered" && previousQuestion.status !== "skipped") {
      throw new ConvexError("Previous question is not answered yet");
    }

    const toReset = questionCards.slice(currentIndex - 1);
    const resetIds = toReset.map((row) => String(row._id));
    for (const row of toReset) {
      await ctx.db.patch("hitlCards", row._id, {
        status: "pending",
        selectedOptionIds: undefined,
        customAnswer: undefined,
      });
    }

    const answers = parseAnswersJson(session.answersJson);
    const nextAnswers = excludeAnswersForCardIds(answers, resetIds);
    await ctx.db.patch("hitlSessions", session._id, {
      answersJson: nextAnswers.length ? JSON.stringify(nextAnswers) : undefined,
    });

    return { ok: true as const, sessionId: session._id };
  },
});

export const continueAfterAnswers = internalMutation({
  args: {
    sessionId: v.id("hitlSessions"),
    ownerUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get("hitlSessions", args.sessionId);
    if (!session || session.ownerUserId !== args.ownerUserId) {
      return { ok: false as const };
    }
    if (session.phase !== "clarifying") {
      return { ok: false as const };
    }
    const cards = await getSessionCards(ctx, session._id);
    if (hasPendingQuestions(cards)) {
      return { ok: false as const };
    }
    if (cards.some((card) => card.kind === "plan_review" || card.kind === "confirmation")) {
      await ctx.db.patch("hitlSessions", session._id, { phase: "plan_review" });
      return { ok: true as const, resumed: false };
    }

    const run = session.runId ? await ctx.db.get("agentRuns", session.runId) : null;
    const prompt = run?.promptSnapshot ?? `Continue for thread ${session.threadId}`;
    const answersContext = formatAnswersForPrompt(parseAnswersJson(session.answersJson));
    await ctx.scheduler.runAfter(0, internal.agent.messages.generateReply, {
      threadId: session.threadId,
      userId: session.ownerUserId,
      promptMessageId: session.promptMessageId,
      prompt: [
        prompt,
        "",
        "The user answered your clarification questions:",
        answersContext,
        "",
        "Continue the /artifact flow. If you still need clarification, call askHuman again. Otherwise call presentPlan with plan bullets but do NOT include final markdown content yet.",
      ].join("\n"),
      visiblePrompt: prompt,
      runId: session.runId,
      commandId: session.commandId,
    });
    return { ok: true as const, resumed: true };
  },
});

export const approveCard = mutation({
  args: {
    cardId: v.id("hitlCards"),
    workspaceId: v.optional(v.id("workspaces")),
  },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const card = await ctx.db.get("hitlCards", args.cardId);
    if (!card || card.ownerUserId !== user._id) {
      throw new ConvexError("Card not found");
    }
    if (card.kind !== "plan_review" && card.kind !== "confirmation") {
      throw new ConvexError("Only plan review or confirmation cards can be approved");
    }
    if (card.status !== "pending") {
      throw new ConvexError("Card is no longer pending");
    }
    const session = await ctx.db.get("hitlSessions", card.sessionId);
    if (!session || session.ownerUserId !== user._id) {
      throw new ConvexError("Session not found");
    }
    if (session.phase === "executing") {
      throw new ConvexError("Already executing");
    }
    if (session.phase !== "plan_review") {
      throw new ConvexError("Session is not awaiting approval");
    }
    const cards = await getSessionCards(ctx, session._id);
    if (!planReviewActionable(cards)) {
      throw new ConvexError("Answer pending questions before building");
    }

    let targetWorkspaceId = card.workspaceId;
    if (card.requiresWorkspacePick) {
      if (!args.workspaceId) {
        throw new ConvexError("Choose a workspace before building");
      }
      await assertWorkspaceOwner(ctx, args.workspaceId, user._id, { requireActive: true });
      targetWorkspaceId = args.workspaceId;
    } else if (!targetWorkspaceId && args.workspaceId) {
      targetWorkspaceId = args.workspaceId;
    }

    const now = Date.now();
    await ctx.db.patch("hitlCards", card._id, {
      status: "approved",
      workspaceId: targetWorkspaceId,
      requiresWorkspacePick: false,
    });
    await ctx.db.patch("hitlSessions", session._id, {
      phase: "executing",
      executionPayloadJson: card.payloadJson,
    });

    if (session.sourceKind === "deep_research" && session.runId) {
      await ctx.scheduler.runAfter(0, internal.agent.deepResearch.startExecuteWorkflow, {
        runId: session.runId,
        ownerUserId: user._id,
        sessionId: session._id,
      });
      return { ok: true as const };
    }

    const payload = card.payloadJson ? JSON.parse(card.payloadJson) : {};
    if (payload.action === "delete") {
      await executeArtifactDelete(ctx, {
        session,
        card,
        payload,
        userId: user._id,
        now,
      });
      return { ok: true as const };
    }

    const run = session.runId ? await ctx.db.get("agentRuns", session.runId) : null;
    const prompt = run?.promptSnapshot ?? `Execute approved plan for thread ${session.threadId}`;
    const answersContext = formatAnswersForPrompt(parseAnswersJson(session.answersJson));
    await ctx.scheduler.runAfter(0, internal.agent.messages.generateReply, {
      threadId: session.threadId,
      userId: session.ownerUserId,
      promptMessageId: session.promptMessageId,
      prompt: [
        prompt,
        "",
        "The user approved your plan. Execute it now.",
        answersContext ? `Clarifications:\n${answersContext}` : "",
        "",
        `Approved plan:\nTitle: ${card.title}\nSummary: ${card.summary}`,
        card.planBullets?.length ? `Steps:\n${card.planBullets.map((b) => `- ${b}`).join("\n")}` : "",
        "",
        "Generate the full Markdown content and call executeWorkspaceArtifact exactly once.",
      ]
        .filter(Boolean)
        .join("\n"),
      visiblePrompt: prompt,
      runId: session.runId,
      commandId: session.commandId,
      hitlExecute: true,
      hitlSessionId: session._id,
      hitlWorkspaceId: targetWorkspaceId,
      hitlPayloadJson: card.payloadJson,
    });
    return { ok: true as const };
  },
});

async function executeArtifactDelete(
  ctx: MutationCtx,
  args: {
    session: Doc<"hitlSessions">;
    card: Doc<"hitlCards">;
    payload: { artifactId?: string; title?: string };
    userId: string;
    now: number;
  },
) {
  const artifactId = args.payload.artifactId as Id<"artifacts"> | undefined;
  if (!artifactId) {
    throw new ConvexError("Missing artifactId for delete");
  }
  await assertDocumentWorkspaceArtifact(ctx, args.userId, artifactId);
  await ctx.runMutation(internal.artifacts.deleteDocumentFromAgentInternal, {
    ownerUserId: args.userId,
    artifactId,
  });
  const messageId = args.session.assistantMessageId ?? args.session.promptMessageId;
  await ctx.db.insert("messageWorkspaceArtifacts", {
    ownerUserId: args.userId,
    threadId: args.session.threadId,
    messageId,
    artifactId,
    relation: "deleted",
    createdAt: args.now,
  });
  await ctx.db.patch("hitlSessions", args.session._id, {
    phase: "completed",
    resolvedAt: args.now,
  });
  if (args.session.runId) {
    await ctx.db.patch("agentRuns", args.session.runId, {
      status: "completed",
      updatedAt: args.now,
      completedAt: args.now,
    });
  }
}

export const completeSessionInternal = internalMutation({
  args: {
    sessionId: v.id("hitlSessions"),
    ownerUserId: v.string(),
    resultArtifactId: v.optional(v.id("artifacts")),
    relation: v.optional(
      v.union(v.literal("created"), v.literal("updated"), v.literal("deleted")),
    ),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get("hitlSessions", args.sessionId);
    if (!session || session.ownerUserId !== args.ownerUserId) {
      return { ok: false as const };
    }
    const now = Date.now();
    const cards = await getSessionCards(ctx, session._id);
    for (const card of cards) {
      if (card.kind === "plan_review" && card.status === "pending") {
        await ctx.db.patch("hitlCards", card._id, { status: "approved" });
      }
    }
    if (args.resultArtifactId && args.relation) {
      const messageId = session.assistantMessageId ?? session.promptMessageId;
      await ctx.db.insert("messageWorkspaceArtifacts", {
        ownerUserId: args.ownerUserId,
        threadId: session.threadId,
        messageId,
        artifactId: args.resultArtifactId,
        relation: args.relation,
        createdAt: now,
      });
    }
    await ctx.db.patch("hitlSessions", session._id, {
      phase: "completed",
      resolvedAt: now,
    });
    if (session.runId) {
      await ctx.db.patch("agentRuns", session.runId, {
        status: "completed",
        updatedAt: now,
        completedAt: now,
      });
    }
    return { ok: true as const };
  },
});

export const failSessionInternal = internalMutation({
  args: {
    sessionId: v.id("hitlSessions"),
    ownerUserId: v.string(),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const session = await ctx.db.get("hitlSessions", args.sessionId);
    if (!session || session.ownerUserId !== args.ownerUserId || session.phase !== "executing") {
      return { ok: false as const };
    }
    const cards = await getSessionCards(ctx, session._id);
    for (const card of cards) {
      if (card.status === "approved") {
        await ctx.db.patch("hitlCards", card._id, { status: "pending" });
      }
    }
    await ctx.db.patch("hitlSessions", session._id, { phase: "plan_review" });
    if (session.runId) {
      await ctx.db.patch("agentRuns", session.runId, {
        status: "waiting",
        updatedAt: Date.now(),
        completedAt: undefined,
      });
    }
    return { ok: true as const };
  },
});

export const rejectSession = mutation({
  args: { sessionId: v.id("hitlSessions") },
  returns: v.object({ ok: v.literal(true) }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const session = await ctx.db.get("hitlSessions", args.sessionId);
    if (!session || session.ownerUserId !== user._id) {
      throw new ConvexError("Session not found");
    }
    if (!activePhases.has(session.phase)) {
      throw new ConvexError("Session is no longer active");
    }
    const now = Date.now();
    const cards = await getSessionCards(ctx, session._id);
    for (const card of cards) {
      if (card.status === "pending") {
        await ctx.db.patch("hitlCards", card._id, { status: "rejected" });
      }
    }
    await ctx.db.patch("hitlSessions", session._id, {
      phase: "cancelled",
      resolvedAt: now,
    });
    if (session.runId) {
      await ctx.db.patch("agentRuns", session.runId, {
        status: "canceled",
        canceledAt: now,
        updatedAt: now,
      });
    }
    return { ok: true as const };
  },
});
