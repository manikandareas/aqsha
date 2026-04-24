import {
  agentEvents,
  agentMessages,
  agentResearchClaims,
  agentResearchEvidenceItems,
  agentResearchSessions,
  agentRuns,
  agentSessions,
  type AgentMessageRecord,
  users,
  workspaces,
  type AgentEventRecord,
  type AgentRunRecord,
  type AgentSessionRecord,
  type JsonValue,
  type UserRecord,
  type WorkspaceRecord,
} from "@aqsha/db";
import { and, asc, desc, eq, ne, or, sql } from "drizzle-orm";
import type { DatabaseClient } from "../../database/client";
import type {
  AgentDepthMode,
  AgentMessageRole,
  AgentMessageStatus,
  AgentResearchPhase,
  AgentRunStatus,
  AgentSessionStatus,
} from "./types";

export interface AgentContext {
  user: UserRecord;
  workspace: WorkspaceRecord;
}

export type AgentContextLookup =
  | { success: true; data: AgentContext }
  | { success: false; error: "unauthorized" | "workspace_not_found" };

export class AgentRepository {
  constructor(private readonly db: DatabaseClient) {}

  async getContextByIdentity(
    authTokenIdentifier: string,
    clerkUserId: string,
  ): Promise<AgentContextLookup> {
    const [row] = await this.db
      .select({
        user: users,
        workspace: workspaces,
      })
      .from(users)
      .leftJoin(workspaces, eq(workspaces.ownerUserId, users.id))
      .where(
        or(
          eq(users.authTokenIdentifier, authTokenIdentifier),
          eq(users.clerkUserId, clerkUserId),
        ),
      )
      .limit(1);

    if (!row) {
      return { success: false, error: "unauthorized" };
    }

    if (!row.workspace) {
      return { success: false, error: "workspace_not_found" };
    }

    return { success: true, data: { user: row.user, workspace: row.workspace } };
  }

  async createResearchSession(input: {
    workspaceId: string;
    userId: string;
    prompt: string;
    depthMode: AgentDepthMode;
    maxResearchIterations: number;
  }): Promise<{ session: AgentSessionRecord; userMessage: AgentMessageRecord }> {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const [session] = await tx
        .insert(agentSessions)
        .values({
          workspaceId: input.workspaceId,
          userId: input.userId,
          workflowType: "research",
          prompt: input.prompt,
          depthMode: input.depthMode,
          status: "running",
          startedAt: now,
          updatedAt: now,
        })
        .returning();

      await tx.insert(agentResearchSessions).values({
        sessionId: session.id,
        workspaceId: input.workspaceId,
        maxResearchIterations: input.maxResearchIterations,
        updatedAt: now,
      });

      const [userMessage] = await tx
        .insert(agentMessages)
        .values({
          sessionId: session.id,
          workspaceId: input.workspaceId,
          userId: input.userId,
          role: "user",
          status: "completed",
          content: input.prompt,
          turnNumber: 1,
          depthMode: input.depthMode,
          updatedAt: now,
        })
        .returning();

      return { session, userMessage };
    });
  }

  async startFollowUpTurn(input: {
    sessionId: string;
    workspaceId: string;
    userId: string;
    message: string;
    depthMode: AgentDepthMode;
    maxResearchIterations: number;
  }): Promise<
    | {
        status: "started";
        session: AgentSessionRecord;
        userMessage: AgentMessageRecord;
      }
    | { status: "not_found" }
    | { status: "busy" }
  > {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const [session] = await tx
        .update(agentSessions)
        .set({
          status: "running",
          depthMode: input.depthMode,
          startedAt: now,
          completedAt: null,
          errorMessage: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(agentSessions.id, input.sessionId),
            eq(agentSessions.workspaceId, input.workspaceId),
            ne(agentSessions.status, "running"),
          ),
        )
        .returning();

      if (!session) {
        const [existing] = await tx
          .select()
          .from(agentSessions)
          .where(
            and(
              eq(agentSessions.id, input.sessionId),
              eq(agentSessions.workspaceId, input.workspaceId),
            ),
          )
          .limit(1);

        if (!existing) {
          return { status: "not_found" };
        }

        return { status: "busy" };
      }

      await tx
        .update(agentResearchSessions)
        .set({
          maxResearchIterations: input.maxResearchIterations,
          updatedAt: now,
        })
        .where(eq(agentResearchSessions.sessionId, input.sessionId));

      const [next] = await tx
        .select({
          value: sql<number>`coalesce(max(${agentMessages.turnNumber}), 0) + 1`,
        })
        .from(agentMessages)
        .where(eq(agentMessages.sessionId, input.sessionId));

      const [userMessage] = await tx
        .insert(agentMessages)
        .values({
          sessionId: input.sessionId,
          workspaceId: input.workspaceId,
          userId: input.userId,
          role: "user",
          status: "completed",
          content: input.message,
          turnNumber: Number(next?.value ?? 1),
          depthMode: input.depthMode,
          updatedAt: now,
        })
        .returning();

      return { status: "started", session, userMessage };
    });
  }

  async getSessionForWorkspace(
    sessionId: string,
    workspaceId: string,
  ): Promise<AgentSessionRecord | null> {
    const [session] = await this.db
      .select()
      .from(agentSessions)
      .where(
        and(
          eq(agentSessions.id, sessionId),
          eq(agentSessions.workspaceId, workspaceId),
        ),
      )
      .limit(1);

    return session ?? null;
  }

  async startRun(input: {
    sessionId: string;
    workspaceId: string;
    phase: AgentResearchPhase;
    model: string;
    maxTurns: number;
    maxBudgetUsd: number;
  }): Promise<AgentRunRecord> {
    const [run] = await this.db
      .insert(agentRuns)
      .values({
        sessionId: input.sessionId,
        workspaceId: input.workspaceId,
        phase: input.phase,
        status: "running",
        model: input.model,
        maxTurns: input.maxTurns,
        maxBudgetUsd: String(input.maxBudgetUsd),
      })
      .returning();

    return run;
  }

  async finishRun(
    runId: string,
    input: {
      status: AgentRunStatus;
      sdkSessionId?: string;
      sdkResultSubtype?: string;
      usage?: JsonValue;
      modelUsage?: JsonValue;
      totalCostUsd?: number;
      errorMessage?: string;
    },
  ): Promise<void> {
    await this.db
      .update(agentRuns)
      .set({
        status: input.status,
        sdkSessionId: input.sdkSessionId,
        sdkResultSubtype: input.sdkResultSubtype,
        usage: input.usage,
        modelUsage: input.modelUsage,
        totalCostUsd:
          input.totalCostUsd === undefined ? undefined : String(input.totalCostUsd),
        errorMessage: input.errorMessage,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentRuns.id, runId));
  }

  async appendEvent(input: {
    sessionId: string;
    runId?: string;
    workspaceId: string;
    phase?: AgentResearchPhase;
    eventType: string;
    rawMessage?: JsonValue;
    curated?: JsonValue;
  }): Promise<AgentEventRecord> {
    return this.db.transaction(async (tx) => {
      const [next] = await tx
        .select({
          value: sql<number>`coalesce(max(${agentEvents.sequence}), 0) + 1`,
        })
        .from(agentEvents)
        .where(eq(agentEvents.sessionId, input.sessionId));

      const [event] = await tx
        .insert(agentEvents)
        .values({
          sessionId: input.sessionId,
          runId: input.runId,
          workspaceId: input.workspaceId,
          phase: input.phase,
          sequence: Number(next?.value ?? 1),
          eventType: input.eventType,
          rawMessage: input.rawMessage,
          curated: input.curated,
        })
        .returning();

      return event;
    });
  }

  async completeSession(
    sessionId: string,
    input: {
      status: AgentSessionStatus;
      finalAnswer?: string | null;
      auditWarnings?: JsonValue;
      auditFailures?: JsonValue;
      errorMessage?: string;
    },
  ): Promise<void> {
    await this.db
      .update(agentSessions)
      .set({
        status: input.status,
        finalAnswer: input.finalAnswer,
        auditWarnings: input.auditWarnings,
        auditFailures: input.auditFailures,
        errorMessage: input.errorMessage,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentSessions.id, sessionId));
  }

  async appendMessage(input: {
    sessionId: string;
    workspaceId: string;
    userId: string;
    role: AgentMessageRole;
    status: AgentMessageStatus;
    content: string;
    turnNumber: number;
    depthMode: AgentDepthMode;
    runId?: string | null;
    errorMessage?: string | null;
    metadata?: JsonValue;
  }): Promise<AgentMessageRecord> {
    const [message] = await this.db
      .insert(agentMessages)
      .values({
        sessionId: input.sessionId,
        workspaceId: input.workspaceId,
        userId: input.userId,
        role: input.role,
        status: input.status,
        content: input.content,
        turnNumber: input.turnNumber,
        depthMode: input.depthMode,
        runId: input.runId,
        errorMessage: input.errorMessage,
        metadata: input.metadata,
        updatedAt: new Date(),
      })
      .returning();

    return message;
  }

  async listSessionMessages(
    sessionId: string,
    workspaceId: string,
  ): Promise<AgentMessageRecord[]> {
    return this.db
      .select()
      .from(agentMessages)
      .where(
        and(
          eq(agentMessages.sessionId, sessionId),
          eq(agentMessages.workspaceId, workspaceId),
        ),
      )
      .orderBy(asc(agentMessages.turnNumber), asc(agentMessages.createdAt));
  }

  async getResearchContext(sessionId: string, workspaceId: string) {
    const [research] = await this.db
      .select()
      .from(agentResearchSessions)
      .where(
        and(
          eq(agentResearchSessions.sessionId, sessionId),
          eq(agentResearchSessions.workspaceId, workspaceId),
        ),
      )
      .limit(1);

    const evidenceItems = await this.db
      .select({
        citationKey: agentResearchEvidenceItems.citationKey,
        title: agentResearchEvidenceItems.title,
        url: agentResearchEvidenceItems.url,
        quote: agentResearchEvidenceItems.quote,
        source: agentResearchEvidenceItems.source,
      })
      .from(agentResearchEvidenceItems)
      .where(
        and(
          eq(agentResearchEvidenceItems.sessionId, sessionId),
          eq(agentResearchEvidenceItems.workspaceId, workspaceId),
        ),
      )
      .orderBy(desc(agentResearchEvidenceItems.createdAt))
      .limit(20);

    const claims = await this.db
      .select({
        text: agentResearchClaims.text,
        confidence: agentResearchClaims.confidence,
        supported: agentResearchClaims.supported,
        citationKeys: agentResearchClaims.citationKeys,
      })
      .from(agentResearchClaims)
      .where(
        and(
          eq(agentResearchClaims.sessionId, sessionId),
          eq(agentResearchClaims.workspaceId, workspaceId),
        ),
      )
      .orderBy(desc(agentResearchClaims.createdAt))
      .limit(20);

    return { research, evidenceItems, claims };
  }

  async saveResearchArtifacts(input: {
    sessionId: string;
    workspaceId: string;
    plan?: JsonValue;
    synthesis?: JsonValue;
    audit?: JsonValue;
    researchIterations?: number;
    evidenceItems?: {
      source: "qdrant" | "websets" | "manual";
      provenance: "retrieved" | "model_cited" | "audited";
      citationKey: string;
      title?: string | null;
      url?: string | null;
      quote: string;
      metadata?: JsonValue;
    }[];
    claims?: {
      text: string;
      confidence: "low" | "medium" | "high";
      supported: boolean;
      citationKeys: string[];
    }[];
  }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(agentResearchSessions)
        .set({
          plan: input.plan,
          synthesis: input.synthesis,
          audit: input.audit,
          researchIterations: input.researchIterations,
          updatedAt: new Date(),
        })
        .where(eq(agentResearchSessions.sessionId, input.sessionId));

      if (input.evidenceItems?.length) {
        await tx.insert(agentResearchEvidenceItems).values(
          input.evidenceItems.map((item) => ({
            sessionId: input.sessionId,
            workspaceId: input.workspaceId,
            source: item.source,
            provenance: item.provenance,
            citationKey: item.citationKey,
            title: item.title,
            url: item.url,
            quote: item.quote,
            metadata: item.metadata,
          })),
        );
      }

      if (input.claims?.length) {
        await tx.insert(agentResearchClaims).values(
          input.claims.map((claim) => ({
            sessionId: input.sessionId,
            workspaceId: input.workspaceId,
            text: claim.text,
            confidence: claim.confidence,
            supported: claim.supported,
            citationKeys: claim.citationKeys,
          })),
        );
      }
    });
  }

  async getResearchReadModel(sessionId: string, workspaceId: string) {
    const session = await this.getSessionForWorkspace(sessionId, workspaceId);

    if (!session) {
      return null;
    }

    const [evidenceSummary] = await this.db
      .select({
        evidenceItemCount: sql<number>`coalesce(count(distinct ${agentResearchEvidenceItems.id}), 0)`,
        supportedClaimCount: sql<number>`coalesce(count(distinct ${agentResearchClaims.id}) filter (where ${agentResearchClaims.supported} = true), 0)`,
      })
      .from(agentSessions)
      .leftJoin(
        agentResearchEvidenceItems,
        eq(agentResearchEvidenceItems.sessionId, agentSessions.id),
      )
      .leftJoin(
        agentResearchClaims,
        eq(agentResearchClaims.sessionId, agentSessions.id),
      )
      .where(eq(agentSessions.id, sessionId));

    return {
      session,
      messages: await this.listSessionMessages(sessionId, workspaceId),
      evidenceSummary: {
        evidenceItemCount: Number(evidenceSummary?.evidenceItemCount ?? 0),
        supportedClaimCount: Number(evidenceSummary?.supportedClaimCount ?? 0),
      },
    };
  }

  async listCuratedEvents(
    sessionId: string,
    workspaceId: string,
  ): Promise<AgentEventRecord[]> {
    return this.db
      .select()
      .from(agentEvents)
      .where(
        and(
          eq(agentEvents.sessionId, sessionId),
          eq(agentEvents.workspaceId, workspaceId),
        ),
      )
      .orderBy(asc(agentEvents.sequence));
  }
}
