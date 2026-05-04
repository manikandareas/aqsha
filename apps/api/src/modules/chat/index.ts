import { Elysia, t } from "elysia";
import type { UIMessageChunk } from "ai";
import { authIdentityPlugin } from "../../plugins/auth-identity";
import { servicesPlugin } from "../../plugins/services";
import { chatModel } from "./model";
import { collectFinishedMessages } from "./vercel-stream";
import type {
  AgentRun,
  AppendAgentEventInput,
  AppendChatSourceInput,
  ChatScope,
} from "./store";

const chatThreadNotFoundResponse = {
  error: {
    code: "chat_thread_not_found" as const,
    message: "Chat thread not found",
  },
};

const agentRunActiveResponse = {
  error: {
    code: "agent_run_active" as const,
    message: "A Deep Research Run is already active for this Research Chat.",
  },
};

const agentRunNotFoundResponse = {
  error: {
    code: "agent_run_not_found" as const,
    message: "Agent run not found",
  },
};

function copyStreamHeaders(headers: Headers): Headers {
  const responseHeaders = new Headers();
  const headerNames = [
    "content-type",
    "cache-control",
    "connection",
    "x-accel-buffering",
    "x-vercel-ai-ui-message-stream",
  ];

  for (const name of headerNames) {
    const value = headers.get(name);

    if (value) {
      responseHeaders.set(name, value);
    }
  }

  return responseHeaders;
}

function createChatRequestId() {
  return crypto.randomUUID();
}

function allCancellationBoundariesFinished(
  boundaries: Record<string, string>,
): boolean {
  return Object.values(boundaries).every((value) => value === "already_finished");
}

function logChatError(
  message: string,
  context: Record<string, unknown>,
  error?: unknown,
) {
  const payload: Record<string, unknown> = {
    level: "error",
    module: "chat",
    message,
    ...context,
  };

  if (error instanceof Error) {
    payload.errorName = error.name;
    payload.errorMessage = error.message;
    payload.stack = error.stack;
  } else if (error !== undefined) {
    payload.error = error;
  }

  console.error(JSON.stringify(payload));
}

function chunkRecord(chunk: UIMessageChunk): Record<string, unknown> {
  return chunk as unknown as Record<string, unknown>;
}

function readableToolName(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.replace(/^tool-/, "").replaceAll("_", " ");
}

function eventForChunk(chunk: UIMessageChunk): Omit<AppendAgentEventInput, "sequence"> | null {
  const record = chunkRecord(chunk);

  switch (chunk.type) {
    case "start":
      return {
        type: "stream_start",
        scope: "stream",
        status: "running",
        title: "Connecting",
        summary: "Astra is opening the response stream.",
        payload: { messageId: record.messageId ?? null },
      };
    case "start-step":
      return {
        type: "step_start",
        scope: "step",
        status: "running",
        title: "Preparing next step",
        summary: "Astra is preparing the next step.",
      };
    case "finish-step":
      return {
        type: "step_finish",
        scope: "step",
        status: "completed",
        title: "Step completed",
        summary: "Astra completed the step.",
      };
    case "reasoning-start":
      return {
        type: "reasoning_start",
        scope: "reasoning",
        status: "running",
        title: "Reasoning",
        summary: "Astra is reasoning.",
      };
    case "reasoning-end":
      return {
        type: "reasoning_end",
        scope: "reasoning",
        status: "completed",
        title: "Reasoning completed",
        summary: "Astra finished reasoning.",
      };
    case "source-url":
      return {
        type: "source_found",
        scope: "source",
        status: "completed",
        title: "Source found",
        summary: typeof record.title === "string" ? record.title : String(record.url ?? ""),
        payload: {
          sourceId: record.sourceId ?? null,
          title: record.title ?? null,
          url: record.url ?? null,
        },
      };
    case "source-document":
      return {
        type: "source_found",
        scope: "source",
        status: "completed",
        title: "Document source found",
        summary: typeof record.title === "string" ? record.title : String(record.filename ?? ""),
        payload: {
          sourceId: record.sourceId ?? null,
          title: record.title ?? null,
          filename: record.filename ?? null,
          mediaType: record.mediaType ?? null,
        },
      };
    case "tool-input-start":
    case "tool-input-available": {
      const toolName = readableToolName(record.toolName);
      return {
        type: "tool_running",
        scope: "tool",
        status: "running",
        title: toolName ? `Using ${toolName}` : "Using a tool",
        summary: "Astra is preparing a tool call.",
        toolName: typeof record.toolName === "string" ? record.toolName : null,
        payload: {
          toolCallId: record.toolCallId ?? null,
          providerExecuted: record.providerExecuted ?? null,
        },
      };
    }
    case "tool-output-available": {
      const toolName = readableToolName(record.toolName);
      return {
        type: "tool_completed",
        scope: "tool",
        status: "completed",
        title: toolName ? `Finished ${toolName}` : "Tool completed",
        summary: "Astra received the tool result.",
        toolName: typeof record.toolName === "string" ? record.toolName : null,
        payload: {
          toolCallId: record.toolCallId ?? null,
          providerExecuted: record.providerExecuted ?? null,
          preliminary: record.preliminary ?? null,
        },
      };
    }
    case "tool-input-error":
    case "tool-output-error": {
      const toolName = readableToolName(record.toolName);
      return {
        type: "tool_failed",
        scope: "tool",
        status: "failed",
        title: toolName ? `${toolName} failed` : "Tool failed",
        summary: typeof record.errorText === "string" ? record.errorText : "A tool failed.",
        toolName: typeof record.toolName === "string" ? record.toolName : null,
        payload: {
          toolCallId: record.toolCallId ?? null,
          errorClass: "model_tool_misuse",
          errorCode: chunk.type,
          developerDetail: {
            errorText: record.errorText ?? null,
            providerExecuted: record.providerExecuted ?? null,
          },
        },
      };
    }
    case "finish":
      return {
        type: "stream_finish",
        scope: "stream",
        status: "completed",
        title: "Response completed",
        summary: "Astra finished the response.",
        payload: {
          finishReason: record.finishReason ?? null,
        },
      };
    default:
      return null;
  }
}

function sourceForChunk(chunk: UIMessageChunk): AppendChatSourceInput | null {
  const record = chunkRecord(chunk);

  if (chunk.type === "source-url") {
    const url = typeof record.url === "string" ? record.url : null;

    if (!url) {
      return null;
    }

    return {
      kind: "url",
      title: typeof record.title === "string" ? record.title : null,
      url,
      providerSourceId:
        typeof record.sourceId === "string" ? record.sourceId : null,
      metadata: { chunkType: chunk.type },
    };
  }

  if (chunk.type === "source-document") {
    const filename =
      typeof record.filename === "string" ? record.filename : null;
    const mediaType =
      typeof record.mediaType === "string" ? record.mediaType : null;
    const providerSourceId =
      typeof record.sourceId === "string" ? record.sourceId : null;

    if (!providerSourceId && !filename && !mediaType) {
      return null;
    }

    return {
      kind: "document",
      title: typeof record.title === "string" ? record.title : filename,
      filename,
      mediaType,
      providerSourceId,
      metadata: { chunkType: chunk.type },
    };
  }

  return null;
}

function createRunEventWriter(
  chatService: {
    appendRunEvent: (
      scope: ChatScope,
      run: Pick<AgentRun, "id" | "chatThreadId">,
      event: AppendAgentEventInput,
    ) => Promise<void>;
  },
  scope: ChatScope,
  run: Pick<AgentRun, "id" | "chatThreadId">,
) {
  let sequence = 0;
  let lastReasoningType: string | null = null;

  return async (event: Omit<AppendAgentEventInput, "sequence">) => {
    if (
      (event.type === "reasoning_start" || event.type === "reasoning_end") &&
      lastReasoningType === event.type
    ) {
      return;
    }

    if (event.type === "reasoning_start" || event.type === "reasoning_end") {
      lastReasoningType = event.type;
    }

    sequence += 1;
    await chatService.appendRunEvent(scope, run, { ...event, sequence });
  };
}

export const chatModule = new Elysia({
  prefix: "/chat",
  name: "module.chat",
  tags: ["chat"],
})
  .use(servicesPlugin)
  .use(authIdentityPlugin)
  .get(
    "/threads",
    async ({ chatService, identity }) => {
      const result = await chatService.listThreads(identity);

      if (!result.success) {
        return [];
      }

      return result.data;
    },
    {
      detail: {
        summary: "List chat threads",
        description: "Returns persisted chat threads for the authenticated user.",
      },
      response: {
        200: t.Array(chatModel.chatThread),
        401: chatModel.unauthorizedError,
      },
    },
  )
  .post(
    "/threads",
    async ({ body, chatService, identity, status }) => {
      const result = await chatService.createThread(identity, body);

      if (!result.success) {
        return status(401, {
          error: { code: "unauthorized", message: "Unauthorized" },
        });
      }

      return status(201, result.data);
    },
    {
      detail: {
        summary: "Create chat thread",
        description: "Creates a persisted chat thread for the authenticated user.",
      },
      body: chatModel.createThreadBody,
      response: {
        201: chatModel.chatThread,
        401: chatModel.unauthorizedError,
      },
    },
  )
  .get(
    "/threads/:id",
    async ({ chatService, identity, params, status }) => {
      const result = await chatService.getThread(identity, params.id);

      if (!result.success) {
        return status(404, chatThreadNotFoundResponse);
      }

      return result.data;
    },
    {
      detail: {
        summary: "Get chat thread",
        description: "Returns a persisted chat thread and its messages.",
      },
      response: {
        200: chatModel.chatThreadDetail,
        401: chatModel.unauthorizedError,
        404: chatModel.chatThreadNotFoundError,
      },
    },
  )
  .delete(
    "/threads/:id",
    async ({ chatService, identity, params, status }) => {
      const result = await chatService.deleteThread(identity, params.id);

      if (!result.success) {
        return status(404, chatThreadNotFoundResponse);
      }

      return result.data;
    },
    {
      detail: {
        summary: "Delete chat thread",
        description: "Deletes a persisted chat thread.",
      },
      response: {
        200: chatModel.okResponse,
        401: chatModel.unauthorizedError,
        404: chatModel.chatThreadNotFoundError,
      },
    },
  )
  .post(
    "/threads/:id/runs/:runId/cancel",
    async ({ chatRunCancellationRegistry, chatService, identity, params, status }) => {
      const result = await chatService.requestRunCancellation(
        identity,
        params.id,
        params.runId,
      );

      if (!result.success) {
        return status(404, agentRunNotFoundResponse);
      }

      const boundaries = chatRunCancellationRegistry.cancel(params.runId);
      const scope = { userId: result.data.userId };

      await chatService.recordRunCancellationPropagation(
        scope,
        result.data,
        boundaries,
      );

      if (allCancellationBoundariesFinished(boundaries)) {
        await chatService.markRunCanceled(scope, result.data);
      }

      return { ok: true };
    },
    {
      detail: {
        summary: "Cancel agent run",
        description:
          "Requests cancellation for an active Deep Research Run in a Research Chat.",
      },
      response: {
        200: chatModel.okResponse,
        401: chatModel.unauthorizedError,
        404: t.Union([
          chatModel.chatThreadNotFoundError,
          chatModel.agentRunNotFoundError,
        ]),
      },
    },
  )
  .post(
    "/threads/:id/messages",
    async ({ agentsService, body, chatRunCancellationRegistry, chatService, identity, params, request, status }) => {
      const requestId = createChatRequestId();
      const messagesResult = await chatService.appendUserMessage(
        identity,
        params.id,
        body.message,
      );

      if (!messagesResult.success) {
        if (messagesResult.error === "agent_run_active") {
          return status(409, agentRunActiveResponse);
        }

        return status(404, chatThreadNotFoundResponse);
      }

      const model = chatService.getModel(messagesResult.data.thread);
      const runResult = await chatService.createRun(identity, params.id, {
        trigger: "submit-message",
        model,
      });

      if (!runResult.success) {
        if (runResult.error === "agent_run_active") {
          return status(409, agentRunActiveResponse);
        }

        return status(404, chatThreadNotFoundResponse);
      }

      const eventWriter = createRunEventWriter(
        chatService,
        runResult.data.scope,
        runResult.data.run,
      );

      await eventWriter({
        type: "run_started",
        scope: "run",
        status: "running",
        title: "Astra started",
        summary: "The agent run has started.",
        agentName: "Astra",
        payload: { model },
      });

      let upstream: Response;
      const cancellationHandle = chatRunCancellationRegistry.track(
        runResult.data.run.id,
        request.signal,
      );

      try {
        upstream = await agentsService.createChatResponse({
          requestId,
          userId: identity.authUserId,
          threadId: params.id,
          runId: runResult.data.run.id,
          model,
          messages: messagesResult.data.messages,
          abortSignal: cancellationHandle.signal,
          onSource: async (source) => {
            try {
              await chatService.appendRunSource(
                runResult.data.scope,
                runResult.data.run,
                source,
              );
            } catch (error) {
              logChatError(
                "Failed to persist agent-used source",
                {
                  requestId,
                  threadId: params.id,
                  runId: runResult.data.run.id,
                  sourceKind: source.kind,
                  sourceRef: source.url ?? source.providerSourceId ?? null,
                },
                error,
              );
            }
          },
        });
      } catch (error) {
        if (cancellationHandle.cancelRequested) {
          await chatService.markRunCanceled(
            runResult.data.scope,
            runResult.data.run,
          );
          cancellationHandle.release();

          return new Response(null, { status: 499 });
        }

        cancellationHandle.release();
        logChatError(
          "Failed to start agents service response",
          {
            requestId,
            threadId: params.id,
            runId: runResult.data.run.id,
          },
          error,
        );
        await eventWriter({
          type: "run_failed",
          scope: "error",
          status: "failed",
          title: "Astra failed to start",
          summary:
            error instanceof Error
              ? error.message
              : "Unable to start the agents service response.",
          agentName: "Astra",
          payload: { requestId },
        });
        await chatService.finishRun(runResult.data.scope, runResult.data.run.id, {
          status: "failed",
          errorMessage:
            error instanceof Error
              ? error.message
              : "Unable to start the agents service response.",
        });

        return new Response(
          JSON.stringify({
            error: {
              code: "agents_service_error",
              message:
                error instanceof Error
                  ? error.message
                  : "Unable to start the agents service response.",
              requestId,
            },
          }),
          {
            status: 502,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      if (!upstream.ok || !upstream.body) {
        cancellationHandle.release();
        const upstreamBody = await upstream.text().catch(() => "");
        const astraRequestId = upstream.headers.get("x-astra-request-id");

        logChatError("Agents service returned an error response", {
          requestId,
          astraRequestId,
          threadId: params.id,
          runId: runResult.data.run.id,
          upstreamStatus: upstream.status,
          upstreamBody,
        });
        await eventWriter({
          type: "run_failed",
          scope: "error",
          status: "failed",
          title: "Astra failed to start",
          summary:
            upstreamBody ||
            `The agent runtime failed with HTTP ${upstream.status}.`,
          agentName: "Astra",
          payload: { requestId, astraRequestId, status: upstream.status, upstreamBody },
        });
        await chatService.finishRun(runResult.data.scope, runResult.data.run.id, {
          status: "failed",
          errorMessage:
            upstreamBody ||
            `Agent runtime failed with HTTP ${upstream.status}.`,
        });

        return new Response(
          JSON.stringify({
            error: {
              code: "agents_service_error",
              message:
                upstreamBody ||
                `Agent runtime failed with HTTP ${upstream.status}.`,
              requestId,
              astraRequestId,
            },
          }),
          {
            status: upstream.status,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const [clientStream, persistenceStream] = upstream.body.tee();
      const astraRequestId = upstream.headers.get("x-astra-request-id");

      void collectFinishedMessages(
        persistenceStream,
        messagesResult.data.messages,
        async (chunk) => {
          const event = eventForChunk(chunk);
          const source = sourceForChunk(chunk);

          if (event) {
            await eventWriter(event);
          }

          if (source) {
            await chatService.appendRunSource(
              runResult.data.scope,
              runResult.data.run,
              source,
            );
          }
        },
      )
        .then(async (messages) => {
          if (cancellationHandle.cancelRequested) {
            await chatService.markRunCanceled(
              runResult.data.scope,
              runResult.data.run,
            );
            return;
          }

          await chatService.saveFinishedMessages(identity, params.id, messages);
          await eventWriter({
            type: "run_completed",
            scope: "run",
            status: "completed",
            title: "Astra finished",
            summary: "The agent run completed successfully.",
            agentName: "Astra",
          });
          await chatService.finishRun(runResult.data.scope, runResult.data.run.id, {
            status: "completed",
          });
        })
        .catch((error: unknown) => {
          if (cancellationHandle.cancelRequested) {
            void chatService.markRunCanceled(
              runResult.data.scope,
              runResult.data.run,
            );
            return;
          }

          logChatError(
            "Failed to persist streamed chat response",
            {
              requestId,
              astraRequestId,
              threadId: params.id,
              runId: runResult.data.run.id,
            },
            error,
          );
          void eventWriter({
            type: "run_failed",
            scope: "error",
            status: "failed",
            title: "Astra failed",
            summary:
              error instanceof Error
                ? error.message
                : "Unable to persist the streamed response.",
            agentName: "Astra",
            payload: { requestId, astraRequestId },
          }).then(() =>
            chatService.finishRun(runResult.data.scope, runResult.data.run.id, {
              status: "failed",
              errorMessage:
                error instanceof Error
                  ? error.message
                  : "Unable to persist the streamed response.",
            }),
          );
        })
        .finally(() => {
          cancellationHandle.release();
        });

      const responseHeaders = copyStreamHeaders(upstream.headers);
      responseHeaders.set("x-aqsha-request-id", requestId);
      if (astraRequestId) {
        responseHeaders.set("x-astra-request-id", astraRequestId);
      }

      return new Response(clientStream, {
        status: upstream.status,
        headers: responseHeaders,
      });
    },
    {
      detail: {
        summary: "Send chat message",
        description: "Streams an assistant response for a persisted chat thread.",
      },
      body: chatModel.sendMessageBody,
      response: {
        401: chatModel.unauthorizedError,
        404: chatModel.chatThreadNotFoundError,
        409: chatModel.agentRunActiveError,
      },
    },
  );
