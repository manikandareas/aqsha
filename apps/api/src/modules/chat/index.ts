import { Elysia, t } from "elysia";
import { env } from "../../config";
import { authIdentityPlugin } from "../../plugins/auth-identity";
import { servicesPlugin } from "../../plugins/services";
import { chatModel } from "./model";
import { collectFinishedMessages } from "./vercel-stream";

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
          messages: messagesResult.data.messages,
        }),
      });

      if (!upstream.ok || !upstream.body) {
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

      void collectFinishedMessages(persistenceStream, messagesResult.data.messages)
        .then((messages) => chatService.saveFinishedMessages(identity, params.id, messages))
        .catch((error: unknown) => {
          console.error("Failed to persist streamed chat response", error);
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
