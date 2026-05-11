import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type ActionCtx,
  type MutationCtx,
} from "../_generated/server";
import {
  getUrlContentProvider,
  type ExternalCandidate,
  lookupDoiProvider,
  searchArxivProvider,
} from "./externalProviders";
import { corpusRag, userNamespace } from "./rag";
import { requireCurrentUser } from "../auth";
import { trimForSnippet } from "./sourceCandidates";

const MAX_SOURCE_TEXT = 40_000;

const sourceTypeValidator = v.union(
  v.literal("manual_text"),
  v.literal("url"),
  v.literal("doi"),
  v.literal("arxiv"),
  v.literal("uploaded_text"),
);

const corpusSourceValidator = v.object({
  _id: v.id("corpusSources"),
  _creationTime: v.number(),
  ownerUserId: v.string(),
  sourceType: sourceTypeValidator,
  status: v.union(
    v.literal("ready"),
    v.literal("indexing"),
    v.literal("metadata_only"),
    v.literal("failed"),
  ),
  title: v.string(),
  locator: v.string(),
  url: v.optional(v.string()),
  doi: v.optional(v.string()),
  arxivId: v.optional(v.string()),
  snippet: v.optional(v.string()),
  textPreview: v.optional(v.string()),
  ragEntryId: v.optional(v.string()),
  failureReason: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const addSourceInputValidator = v.union(
  v.object({
    type: v.literal("manual_text"),
    title: v.string(),
    text: v.string(),
  }),
  v.object({
    type: v.literal("uploaded_text"),
    title: v.string(),
    text: v.string(),
  }),
  v.object({
    type: v.literal("url"),
    url: v.string(),
    title: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("doi"),
    doi: v.string(),
    title: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("arxiv"),
    arxivId: v.string(),
    title: v.optional(v.string()),
  }),
);

type AddSourceInput =
  | { type: "manual_text"; title: string; text: string }
  | { type: "uploaded_text"; title: string; text: string }
  | { type: "url"; url: string; title?: string }
  | { type: "doi"; doi: string; title?: string }
  | { type: "arxiv"; arxivId: string; title?: string };

type PreparedSource = {
  sourceType: Doc<"corpusSources">["sourceType"];
  status: "indexing" | "metadata_only" | "failed";
  title: string;
  locator: string;
  url?: string;
  doi?: string;
  arxivId?: string;
  snippet?: string;
  textPreview?: string;
  text?: string;
  failureReason?: string;
};

export const addSource = action({
  args: { input: addSourceInputValidator },
  returns: v.object({
    sourceId: v.id("corpusSources"),
    status: v.union(
      v.literal("ready"),
      v.literal("indexing"),
      v.literal("metadata_only"),
      v.literal("failed"),
    ),
  }),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const prepared: PreparedSource = await prepareSource(ctx, user._id, args.input);
    const sourceId: Id<"corpusSources"> = await ctx.runMutation(
      internal.agent.corpus.insertSource,
      {
        ownerUserId: user._id,
        ...prepared,
      },
    );

    if (prepared.text) {
      try {
        const indexed = await corpusRag.add(ctx, {
          namespace: userNamespace(user._id),
          key: sourceId,
          text: prepared.text,
          title: prepared.title,
          metadata: {
            corpusSourceId: sourceId,
            title: prepared.title,
            locator: prepared.locator,
            sourceType: prepared.sourceType,
            url: prepared.url,
            doi: prepared.doi,
            arxivId: prepared.arxivId,
          },
          filterValues: [
            { name: "sourceType", value: prepared.sourceType },
            { name: "corpusSourceId", value: sourceId },
          ],
        });
        await ctx.runMutation(internal.agent.corpus.markIndexed, {
          sourceId,
          ownerUserId: user._id,
          ragEntryId: indexed.entryId,
        });
        return { sourceId, status: "ready" as const };
      } catch (error) {
        await ctx.runMutation(internal.agent.corpus.markFailed, {
          sourceId,
          ownerUserId: user._id,
          failureReason: readableError(error),
        });
        return { sourceId, status: "failed" as const };
      }
    }

    return { sourceId, status: prepared.status };
  },
});

export const list = query({
  args: {},
  returns: v.array(corpusSourceValidator),
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    return await ctx.db
      .query("corpusSources")
      .withIndex("by_owner_created", (q) => q.eq("ownerUserId", user._id))
      .order("desc")
      .take(100);
  },
});

export const get = query({
  args: { sourceId: v.id("corpusSources") },
  returns: v.union(corpusSourceValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    const source = await ctx.db.get("corpusSources", args.sourceId);
    return source?.ownerUserId === user._id ? source : null;
  },
});

export const search = action({
  args: {
    query: v.string(),
    filters: v.optional(
      v.object({
        sourceType: v.optional(sourceTypeValidator),
        corpusSourceId: v.optional(v.id("corpusSources")),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireCurrentUser(ctx);
    return await searchOwnedCorpus(ctx, {
      ownerUserId: user._id,
      query: args.query,
      sourceType: args.filters?.sourceType,
      corpusSourceId: args.filters?.corpusSourceId,
    });
  },
});

export const searchInternal = internalAction({
  args: {
    ownerUserId: v.string(),
    query: v.string(),
    sourceType: v.optional(sourceTypeValidator),
    corpusSourceId: v.optional(v.id("corpusSources")),
  },
  handler: async (ctx, args) => searchOwnedCorpus(ctx, args),
});

export const getSourceInternal = internalQuery({
  args: { ownerUserId: v.string(), sourceId: v.id("corpusSources") },
  handler: async (ctx, args) => {
    const source = await ctx.db.get("corpusSources", args.sourceId);
    return source?.ownerUserId === args.ownerUserId ? source : null;
  },
});

export const insertSource = internalMutation({
  args: {
    ownerUserId: v.string(),
    sourceType: sourceTypeValidator,
    status: v.union(v.literal("indexing"), v.literal("metadata_only"), v.literal("failed")),
    title: v.string(),
    locator: v.string(),
    url: v.optional(v.string()),
    doi: v.optional(v.string()),
    arxivId: v.optional(v.string()),
    snippet: v.optional(v.string()),
    textPreview: v.optional(v.string()),
    text: v.optional(v.string()),
    failureReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("corpusSources", {
      ownerUserId: args.ownerUserId,
      sourceType: args.sourceType,
      status: args.status,
      title: args.title,
      locator: args.locator,
      url: args.url,
      doi: args.doi,
      arxivId: args.arxivId,
      snippet: args.snippet,
      textPreview: args.textPreview,
      failureReason: args.failureReason,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const markIndexed = internalMutation({
  args: {
    sourceId: v.id("corpusSources"),
    ownerUserId: v.string(),
    ragEntryId: v.string(),
  },
  handler: async (ctx, args) => {
    const source = await ownedSource(ctx, args.sourceId, args.ownerUserId);
    await ctx.db.patch("corpusSources", source._id, {
      status: "ready",
      ragEntryId: args.ragEntryId,
      updatedAt: Date.now(),
    });
  },
});

export const markFailed = internalMutation({
  args: {
    sourceId: v.id("corpusSources"),
    ownerUserId: v.string(),
    failureReason: v.string(),
  },
  handler: async (ctx, args) => {
    const source = await ownedSource(ctx, args.sourceId, args.ownerUserId);
    await ctx.db.patch("corpusSources", source._id, {
      status: "failed",
      failureReason: args.failureReason,
      updatedAt: Date.now(),
    });
  },
});

async function prepareSource(
  ctx: ActionCtx,
  ownerUserId: string,
  input: AddSourceInput,
): Promise<PreparedSource> {
  if (input.type === "manual_text" || input.type === "uploaded_text") {
    const text = boundedText(input.text);
    return {
      sourceType: input.type,
      status: "indexing" as const,
      title: input.title.trim() || "Untitled source",
      locator: input.title.trim() || input.type,
      snippet: trimForSnippet(text),
      textPreview: trimForSnippet(text, 240),
      text,
    };
  }

  if (input.type === "url") {
    const content = await getUrlContentProvider(ctx, {
      ownerUserId,
      url: input.url.trim(),
    });
    const text = boundedText(content.text || content.snippet || "");
    return {
      sourceType: "url" as const,
      status: text ? ("indexing" as const) : ("failed" as const),
      title: input.title?.trim() || content.title,
      locator: content.url,
      url: content.url,
      snippet: content.snippet,
      textPreview: trimForSnippet(text, 240),
      text: text || undefined,
      failureReason: text ? undefined : "URL content was empty",
    };
  }

  if (input.type === "doi") {
    const [candidate]: ExternalCandidate[] = await lookupDoiProvider(ctx, {
      ownerUserId,
      doi: input.doi,
    });
    if (!candidate) {
      throw new ConvexError("DOI was not found");
    }
    const abstract: string = candidate.snippet.includes("metadata only")
      ? ""
      : candidate.snippet;
    return {
      sourceType: "doi" as const,
      status: abstract ? ("indexing" as const) : ("metadata_only" as const),
      title: input.title?.trim() || candidate.title,
      locator: candidate.doi ?? input.doi.trim(),
      url: candidate.url,
      doi: candidate.doi ?? input.doi.trim(),
      snippet: candidate.snippet,
      textPreview: trimForSnippet(abstract, 240),
      text: abstract || undefined,
    };
  }

  const [candidate]: ExternalCandidate[] = await searchArxivProvider(ctx, {
    ownerUserId,
    query: input.arxivId,
    limit: 1,
  });
  if (!candidate) {
    throw new ConvexError("arXiv ID was not found");
  }
  const text = boundedText(candidate.snippet);
  return {
    sourceType: "arxiv" as const,
    status: text ? ("indexing" as const) : ("metadata_only" as const),
    title: input.title?.trim() || candidate.title,
    locator: candidate.arxivId ?? input.arxivId.trim(),
    url: candidate.url,
    doi: candidate.doi,
    arxivId: candidate.arxivId ?? input.arxivId.trim(),
    snippet: candidate.snippet,
    textPreview: trimForSnippet(text, 240),
    text: text || undefined,
  };
}

async function searchOwnedCorpus(
  ctx: ActionCtx,
  args: {
    ownerUserId: string;
    query: string;
    sourceType?: Doc<"corpusSources">["sourceType"];
    corpusSourceId?: Id<"corpusSources">;
  },
) {
  const filters = [];
  if (args.sourceType) {
    filters.push({ name: "sourceType" as const, value: args.sourceType });
  }
  if (args.corpusSourceId) {
    filters.push({ name: "corpusSourceId" as const, value: args.corpusSourceId });
  }

  const result = await corpusRag.search(ctx, {
    namespace: userNamespace(args.ownerUserId),
    query: args.query,
    limit: 5,
    vectorScoreThreshold: 0.35,
    filters: filters.length > 0 ? filters : undefined,
  });

  return result.entries.slice(0, 5).map((entry) => {
    const metadata = entry.metadata;
    const sourceId = metadata?.corpusSourceId as Id<"corpusSources"> | undefined;
    const text = result.text || entry.text;
    return {
      origin: "corpus" as const,
      evidenceStrength: "strong" as const,
      title: metadata?.title ?? entry.title ?? "Corpus source",
      locator: metadata?.locator ?? sourceId ?? "Corpus",
      url: metadata?.url,
      doi: metadata?.doi,
      arxivId: metadata?.arxivId,
      snippet: trimForSnippet(text || entry.text || "Corpus match"),
      corpusSourceId: sourceId,
    };
  });
}

async function ownedSource(
  ctx: MutationCtx,
  sourceId: Id<"corpusSources">,
  ownerUserId: string,
) {
  const source = await ctx.db.get("corpusSources", sourceId);
  if (!source || source.ownerUserId !== ownerUserId) {
    throw new ConvexError("Source not found");
  }
  return source;
}

function boundedText(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > MAX_SOURCE_TEXT ? text.slice(0, MAX_SOURCE_TEXT) : text;
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : "Unknown indexing failure";
}
