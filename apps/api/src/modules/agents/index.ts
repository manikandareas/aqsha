import { Elysia, t } from "elysia";
import { agentsModel } from "./model";
import { authIdentityPlugin } from "../../plugins/auth-identity";
import { servicesPlugin } from "../../plugins/services";
import type { AgentProgressEvent } from "./types";

export const agentsModule = new Elysia({
  prefix: "/agents",
  name: "module.agents",
  tags: ["agents"],
})
  .use(servicesPlugin)
  .use(authIdentityPlugin)
  .post(
    "/research",
    async ({ agentService, body, identity, status }) => {
      const result = await agentService.startResearch(identity, body);

      if (!result.success) {
        if (result.error === "unauthorized") {
          return status(401, {
            error: { code: "unauthorized", message: "Unauthorized" },
          });
        }

        return status(404, {
          error: {
            code: "workspace_not_found",
            message: "Workspace not found",
          },
        });
      }

      return streamSse(result.data);
    },
    {
      detail: {
        summary: "Start research agent",
        description:
          "Starts an authenticated research workflow and streams curated progress events.",
      },
      body: agentsModel.createResearchBody,
      response: {
        200: t.Any(),
        401: agentsModel.unauthorizedError,
        404: agentsModel.workspaceNotFoundError,
      },
    },
  )
  .post(
    "/research/:sessionId/messages",
    async ({ agentService, body, identity, params, status }) => {
      const result = await agentService.followUpResearch(
        identity,
        params.sessionId,
        body,
      );

      if (!result.success) {
        if (result.error === "unauthorized") {
          return status(401, {
            error: { code: "unauthorized", message: "Unauthorized" },
          });
        }

        if (result.error === "workspace_not_found") {
          return status(404, {
            error: {
              code: "workspace_not_found",
              message: "Workspace not found",
            },
          });
        }

        if (result.error === "agent_session_busy") {
          return status(409, {
            error: {
              code: "agent_session_busy",
              message: "Research session is already running",
            },
          });
        }

        return status(404, {
          error: {
            code: "agent_session_not_found",
            message: "Agent session not found",
          },
        });
      }

      return streamSse(result.data);
    },
    {
      detail: {
        summary: "Send research follow-up message",
        description:
          "Adds a user message to an existing research session and streams the next research run.",
      },
      params: agentsModel.sessionParams,
      body: agentsModel.followUpResearchBody,
      response: {
        200: t.Any(),
        401: agentsModel.unauthorizedError,
        404: agentsModel.notFoundError,
        409: agentsModel.sessionBusyError,
      },
    },
  )
  .get(
    "/research/:sessionId",
    async ({ agentService, identity, params, status }) => {
      const result = await agentService.getResearchSession(
        identity,
        params.sessionId,
      );

      if (!result.success) {
        if (result.error === "unauthorized") {
          return status(401, {
            error: { code: "unauthorized", message: "Unauthorized" },
          });
        }

        if (result.error === "workspace_not_found") {
          return status(404, {
            error: {
              code: "workspace_not_found",
              message: "Workspace not found",
            },
          });
        }

        return status(404, {
          error: {
            code: "agent_session_not_found",
            message: "Agent session not found",
          },
        });
      }

      return result.data;
    },
    {
      detail: {
        summary: "Get research session",
        description:
          "Returns durable research state for the authenticated user's owned workspace.",
      },
      params: agentsModel.sessionParams,
      response: {
        200: agentsModel.researchSession,
        401: agentsModel.unauthorizedError,
        404: agentsModel.notFoundError,
      },
    },
  )
  .get(
    "/research/:sessionId/events",
    async ({ agentService, identity, params, status }) => {
      const result = await agentService.listResearchEvents(
        identity,
        params.sessionId,
      );

      if (!result.success) {
        if (result.error === "unauthorized") {
          return status(401, {
            error: { code: "unauthorized", message: "Unauthorized" },
          });
        }

        if (result.error === "workspace_not_found") {
          return status(404, {
            error: {
              code: "workspace_not_found",
              message: "Workspace not found",
            },
          });
        }

        return status(404, {
          error: {
            code: "agent_session_not_found",
            message: "Agent session not found",
          },
        });
      }

      return result.data;
    },
    {
      detail: {
        summary: "List research events",
        description:
          "Returns curated persisted progress/debug events without raw SDK payloads.",
      },
      params: agentsModel.sessionParams,
      response: {
        200: t.Array(agentsModel.persistedEvent),
        401: agentsModel.unauthorizedError,
        404: agentsModel.notFoundError,
      },
    },
  );

function streamSse(events: AsyncGenerator<AgentProgressEvent>) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          for await (const event of events) {
            controller.enqueue(
            encoder.encode(
              `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
            ),
            );
          }
        } catch (error) {
          const event = {
            type: "failed",
            message: error instanceof Error ? error.message : String(error),
            at: new Date().toISOString(),
          };
          controller.enqueue(
            encoder.encode(`event: failed\ndata: ${JSON.stringify(event)}\n\n`),
          );
        } finally {
          controller.close();
        }
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    },
  );
}
