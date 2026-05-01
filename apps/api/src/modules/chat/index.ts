import { Elysia, t } from "elysia";
import type { UIMessageChunk } from "ai";
import { env } from "../../config";
import { authIdentityPlugin } from "../../plugins/auth-identity";
import { servicesPlugin } from "../../plugins/services";
import { chatModel } from "./model";
import { collectFinishedMessages } from "./vercel-stream";
import type { AgentRun, AppendAgentEventInput, ChatScope } from "./store";

const chatThreadNotFoundResponse = {
  error: {
    code: "chat_thread_not_found" as const,
    message: "Chat thread not found",
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
        title: "Connecting to Astra",
        summary: "The assistant stream has started.",
        payload: { messageId: record.messageId ?? null },
      };
    case "start-step":
      return {
        type: "step_start",
        scope: "step",
        status: "running",
        title: "Starting an agent step",
        summary: "Astra is preparing the next part of the response.",
      };
    case "finish-step":
      return {
        type: "step_finish",
        scope: "step",
        status: "completed",
        title: "Finished an agent step",
        summary: "Astra completed one reasoning or tool-use step.",
      };
    case "reasoning-start":
      return {
        type: "reasoning_start",
        scope: "reasoning",
        status: "running",
        title: "Thinking through the request",
        summary: "Astra is reasoning before answering.",
      };
    case "reasoning-end":
      return {
        type: "reasoning_end",
        scope: "reasoning",
        status: "completed",
        title: "Reasoning completed",
        summary: "Astra finished its private reasoning step.",
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
        },
      };
    }
    case "finish":
      return {
        type: "stream_finish",
        scope: "stream",
        status: "completed",
        title: "Response stream completed",
        summary: "Astra finished streaming the answer.",
        payload: {
          finishReason: record.finishReason ?? null,
        },
      };
    default:
      return null;
  }
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
    "/threads/:id/messages",
    async ({ body, chatService, identity, params, status }) => {
      const messagesResult = await chatService.appendUserMessage(
        identity,
        params.id,
        body.message,
      );

      if (!messagesResult.success) {
        return status(404, chatThreadNotFoundResponse);
      }

      const model = chatService.getModel(messagesResult.data.thread);
      const runResult = await chatService.createRun(identity, params.id, {
        trigger: "submit-message",
        model,
      });

      if (!runResult.success) {
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

      const headers = new Headers({
        Authorization: `Bearer ${env.ASTRA_INTERNAL_TOKEN}`,
        "Content-Type": "application/json",
        "x-astra-user-id": identity.authUserId,
      });

      if (model) {
        headers.set("x-astra-model", model);
      }

      const upstream = await fetch(`${env.AGENTS_BASE_URL}/internal/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          trigger: "submit-message",
          id: params.id,
          runId: runResult.data.run.id,
          messages: messagesResult.data.messages,
        }),
      });

      if (!upstream.ok || !upstream.body) {
        await eventWriter({
          type: "run_failed",
          scope: "error",
          status: "failed",
          title: "Astra failed to start",
          summary: "The agents service failed to stream a response.",
          agentName: "Astra",
          payload: { status: upstream.status },
        });
        await chatService.finishRun(runResult.data.scope, runResult.data.run.id, {
          status: "failed",
          errorMessage: "Agents service failed to stream a response",
        });

        return new Response(
          JSON.stringify({
            error: {
              code: "agents_service_error",
              message: "Agents service failed to stream a response",
            },
          }),
          {
            status: upstream.status,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      const [clientStream, persistenceStream] = upstream.body.tee();

      void collectFinishedMessages(
        persistenceStream,
        messagesResult.data.messages,
        async (chunk) => {
          const event = eventForChunk(chunk);

          if (event) {
            await eventWriter(event);
          }
        },
      )
        .then(async (messages) => {
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
          console.error("Failed to persist streamed chat response", error);
          void eventWriter({
            type: "run_failed",
            scope: "error",
            status: "failed",
            title: "Astra failed",
            summary: error instanceof Error ? error.message : "Unable to persist the streamed response.",
            agentName: "Astra",
          }).then(() =>
            chatService.finishRun(runResult.data.scope, runResult.data.run.id, {
              status: "failed",
              errorMessage:
                error instanceof Error
                  ? error.message
                  : "Unable to persist the streamed response.",
            }),
          );
        });

      return new Response(clientStream, {
        status: upstream.status,
        headers: copyStreamHeaders(upstream.headers),
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
      },
    },
  );
