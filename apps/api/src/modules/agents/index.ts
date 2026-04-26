import { Elysia, t } from "elysia";
import { authIdentityPlugin } from "../../plugins/auth-identity";
import { servicesPlugin } from "../../plugins/services";
import { agentModel } from "./model";

const errorPayload = (code: string, message: string) => ({
  error: { code, message },
});

export const agentsModule = new Elysia({
  prefix: "/agents",
  name: "module.agents",
  tags: ["agents"],
})
  .use(servicesPlugin)
  .use(authIdentityPlugin)
  .post(
    "/threads",
    async ({ agentService, body, identity, status }) => {
      const result = await agentService.createThread(identity, body);

      if (!result.success) {
        if (result.error === "unauthorized") {
          return status(401, errorPayload("unauthorized", "Unauthorized"));
        }

        return status(
          404,
          errorPayload("workspace_not_found", "Workspace not found"),
        );
      }

      return status(201, result.data);
    },
    {
      body: agentModel.createThreadBody,
      response: {
        201: agentModel.thread,
        401: agentModel.unauthorizedError,
        404: agentModel.workspaceNotFoundError,
      },
    },
  )
  .get(
    "/threads",
    async ({ agentService, identity, status }) => {
      const result = await agentService.listThreads(identity);

      if (!result.success) {
        if (result.error === "unauthorized") {
          return status(401, errorPayload("unauthorized", "Unauthorized"));
        }

        return status(
          404,
          errorPayload("workspace_not_found", "Workspace not found"),
        );
      }

      return result.data;
    },
    {
      response: {
        200: t.Array(agentModel.thread),
        401: agentModel.unauthorizedError,
        404: agentModel.workspaceNotFoundError,
      },
    },
  )
  .get(
    "/threads/:threadId",
    async ({ agentService, identity, params, status }) => {
      const result = await agentService.getThread(identity, params.threadId);

      if (!result.success) {
        if (result.error === "unauthorized") {
          return status(401, errorPayload("unauthorized", "Unauthorized"));
        }

        if (result.error === "workspace_not_found") {
          return status(
            404,
            errorPayload("workspace_not_found", "Workspace not found"),
          );
        }

        return status(
          404,
          errorPayload("agent_thread_not_found", "Agent thread not found"),
        );
      }

      return result.data;
    },
    {
      params: t.Object({ threadId: t.String({ format: "uuid" }) }),
      response: {
        200: agentModel.threadDetail,
        401: agentModel.unauthorizedError,
        404: t.Union([
          agentModel.workspaceNotFoundError,
          agentModel.threadNotFoundError,
        ]),
      },
    },
  )
  .delete(
    "/threads/:threadId",
    async ({ agentService, identity, params, status }) => {
      const result = await agentService.archiveThread(identity, params.threadId);

      if (!result.success) {
        if (result.error === "unauthorized") {
          return status(401, errorPayload("unauthorized", "Unauthorized"));
        }

        if (result.error === "workspace_not_found") {
          return status(
            404,
            errorPayload("workspace_not_found", "Workspace not found"),
          );
        }

        return status(
          404,
          errorPayload("agent_thread_not_found", "Agent thread not found"),
        );
      }

      return result.data;
    },
    {
      params: t.Object({ threadId: t.String({ format: "uuid" }) }),
      response: {
        200: agentModel.thread,
        401: agentModel.unauthorizedError,
        404: t.Union([
          agentModel.workspaceNotFoundError,
          agentModel.threadNotFoundError,
        ]),
      },
    },
  )
  .post(
    "/threads/:threadId/messages",
    async ({ agentService, body, identity, params, status }) => {
      const result = await agentService.createMessageRun(
        identity,
        params.threadId,
        body,
      );

      if (!result.success) {
        if (result.error === "unauthorized") {
          return status(401, errorPayload("unauthorized", "Unauthorized"));
        }

        if (result.error === "agent_session_busy") {
          return status(
            409,
            errorPayload(
              "agent_session_busy",
              "An agent run is already active for this thread.",
            ),
          );
        }

        if (result.error === "workspace_not_found") {
          return status(
            404,
            errorPayload("workspace_not_found", "Workspace not found"),
          );
        }

        return status(
          404,
          errorPayload("agent_thread_not_found", "Agent thread not found"),
        );
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          for await (const chunk of agentService.streamRun(result.data)) {
            controller.enqueue(encoder.encode(chunk));
          }

          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
        },
      });
    },
    {
      params: t.Object({ threadId: t.String({ format: "uuid" }) }),
      body: agentModel.createMessageBody,
      response: {
        200: t.Any(),
        401: agentModel.unauthorizedError,
        404: t.Union([
          agentModel.workspaceNotFoundError,
          agentModel.threadNotFoundError,
        ]),
        409: agentModel.sessionBusyError,
      },
    },
  )
  .get(
    "/runs/:runId/events",
    async ({ agentService, identity, params, status }) => {
      const result = await agentService.replayRunEvents(identity, params.runId);

      if (!result.success) {
        if (result.error === "unauthorized") {
          return status(401, errorPayload("unauthorized", "Unauthorized"));
        }

        if (result.error === "workspace_not_found") {
          return status(
            404,
            errorPayload("workspace_not_found", "Workspace not found"),
          );
        }

        return status(404, errorPayload("agent_run_not_found", "Agent run not found"));
      }

      return result.data;
    },
    {
      params: t.Object({ runId: t.String({ format: "uuid" }) }),
      response: {
        200: t.Array(agentModel.event),
        401: agentModel.unauthorizedError,
        404: t.Union([
          agentModel.workspaceNotFoundError,
          agentModel.runNotFoundError,
        ]),
      },
    },
  )
  .post(
    "/runs/:runId/cancel",
    async ({ agentService, identity, params, status }) => {
      const result = await agentService.cancelRun(identity, params.runId);

      if (!result.success) {
        if (result.error === "unauthorized") {
          return status(401, errorPayload("unauthorized", "Unauthorized"));
        }

        if (result.error === "workspace_not_found") {
          return status(
            404,
            errorPayload("workspace_not_found", "Workspace not found"),
          );
        }

        return status(404, errorPayload("agent_run_not_found", "Agent run not found"));
      }

      return result.data;
    },
    {
      params: t.Object({ runId: t.String({ format: "uuid" }) }),
      response: {
        200: agentModel.run,
        401: agentModel.unauthorizedError,
        404: t.Union([
          agentModel.workspaceNotFoundError,
          agentModel.runNotFoundError,
        ]),
      },
    },
  );
