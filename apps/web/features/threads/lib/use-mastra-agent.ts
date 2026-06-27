"use client";

import { useAuth } from "@clerk/nextjs";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { queryKeys } from "../../../lib/api-query";
import type { TimelineMessage } from "./timeline-types";
import { ASTRA_AGENT_ID, useMastraClient } from "./mastra-client";
import {
  type MastraApproval,
  type MastraChunk,
  type MastraTimelineState,
  initialMastraTimeline,
  reduceMastraChunk,
  settleAssistantTurn,
  startAssistantTurn,
} from "./mastra-timeline";

export type MastraAgentStatus = "ready" | "submitted" | "streaming";

export type MastraAgent = {
  status: MastraAgentStatus;
  messages: TimelineMessage[];
  approvals: MastraApproval[];
  error: { message: string } | null;
  send: (text: string, clientContext?: string[]) => Promise<void>;
  approve: (toolCallId: string) => Promise<void>;
  decline: (toolCallId: string) => Promise<void>;
  stop: () => void;
};

type ApprovalStream = {
  processDataStream: (o: { onChunk: (c: unknown) => void }) => Promise<void>;
};

/**
 * Hook agent Mastra (Fase 1) — pengganti `useAstraAgent` (eve) di belakang flag
 * `NEXT_PUBLIC_AGENT_RUNTIME=mastra`. Mengelola stream `@mastra/client-js` → `TimelineMessage[]`
 * (adapter `mastra-timeline`), HITL approval (`approveToolCall`/`declineToolCall`), dan stop.
 *
 * Memory = SoT pesan: klien hanya kirim pesan BARU (string); Mastra memuat history dari storage.
 * `resource` di-override server (`mapUserToResourceId`) — kirim Clerk userId apa adanya. `thread`
 * = id thread (klien yang menentukan; thread baru pakai id yang sudah disiapkan pemanggil).
 */
export function useMastraAgent(opts: {
  threadId: string;
  seedMessages?: TimelineMessage[];
}): MastraAgent {
  const abortRef = useRef<AbortController | null>(null);
  const getSignal = useCallback(() => abortRef.current?.signal, []);
  const client = useMastraClient(getSignal);
  const { userId } = useAuth();
  const qc = useQueryClient();

  const [state, setState] = useState<MastraTimelineState>(() =>
    initialMastraTimeline(opts.seedMessages ?? []),
  );
  const [status, setStatus] = useState<MastraAgentStatus>("ready");

  const onChunk = useCallback((chunk: unknown) => {
    setState((s) => reduceMastraChunk(s, chunk as MastraChunk));
  }, []);

  const pump = useCallback(
    async (stream: ApprovalStream) => {
      setStatus("streaming");
      await stream.processDataStream({ onChunk });
    },
    [onChunk],
  );

  const finishTurn = useCallback(() => {
    setState((s) => settleAssistantTurn(s));
    setStatus("ready");
    abortRef.current = null;
    void qc.invalidateQueries({ queryKey: queryKeys.threads.all });
  }, [qc]);

  const send = useCallback(
    async (text: string, clientContext?: string[]) => {
      if (!text.trim() || status !== "ready") return;
      setStatus("submitted");
      const turnSeed = `${opts.threadId}:${Date.now()}`;
      setState((s) => startAssistantTurn(s, text, turnSeed));
      abortRef.current = new AbortController();
      try {
        const agent = client.getAgent(ASTRA_AGENT_ID);
        // `clientContext` (ekspansi command + catatan @mention) = konteks EPHEMERAL: dikirim
        // sebagai `context` per-call (tak dipersist ke memory thread), parity eve clientContext.
        const res = await agent.stream(text, {
          memory: { thread: opts.threadId, resource: userId ?? undefined },
          ...(clientContext && clientContext.length > 0
            ? { context: clientContext.map((c) => ({ role: "user" as const, content: c })) }
            : {}),
        });
        await pump(res as unknown as ApprovalStream);
      } catch (err) {
        setState((s) => ({ ...s, error: (err as Error).message }));
      } finally {
        finishTurn();
      }
    },
    [client, opts.threadId, userId, status, pump, finishTurn],
  );

  const respond = useCallback(
    async (toolCallId: string, approved: boolean) => {
      const runId = state.runId;
      if (!runId) return;
      setState((s) => ({ ...s, approvals: s.approvals.filter((a) => a.toolCallId !== toolCallId) }));
      abortRef.current = new AbortController();
      try {
        const agent = client.getAgent(ASTRA_AGENT_ID);
        const res = approved
          ? await agent.approveToolCall({ runId, toolCallId })
          : await agent.declineToolCall({ runId, toolCallId });
        await pump(res as unknown as ApprovalStream);
      } catch (err) {
        setState((s) => ({ ...s, error: (err as Error).message }));
      } finally {
        finishTurn();
      }
    },
    [client, state.runId, pump, finishTurn],
  );

  const approve = useCallback((toolCallId: string) => respond(toolCallId, true), [respond]);
  const decline = useCallback((toolCallId: string) => respond(toolCallId, false), [respond]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((s) => settleAssistantTurn(s));
    setStatus("ready");
  }, []);

  return {
    status,
    messages: state.messages,
    approvals: state.approvals,
    error: state.error ? { message: state.error } : null,
    send,
    approve,
    decline,
    stop,
  };
}
