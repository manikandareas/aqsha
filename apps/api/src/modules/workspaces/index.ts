import { Elysia, t } from "elysia";
import { authIdentityPlugin } from "../../plugins/auth-identity";
import { servicesPlugin } from "../../plugins/services";
import { workspaceModel } from "./model";

function getWorkspaceNameError(name: string): string | null {
  if (!name) {
    return "Workspace name is required.";
  }

  if (name.length > 80) {
    return "Workspace name must be 80 characters or fewer.";
  }

  return null;
}

export const workspacesModule = new Elysia({
  prefix: "/workspaces",
  name: "module.workspaces",
  tags: ["workspaces"],
})
  .use(servicesPlugin)
  .use(authIdentityPlugin)
  .get(
    "/",
    async ({ identity, workspaceService }) => {
      return workspaceService.getWorkspaceList(identity.authUserId);
    },
    {
      detail: {
        summary: "List workspaces",
        description:
          "Returns workspaces available to the authenticated user and marks the active workspace.",
      },
      response: {
        200: t.Array(workspaceModel.workspaceSwitcherItem),
        401: workspaceModel.unauthorizedError,
      },
    },
  )
  .post(
    "/",
    async ({ authSession, body, sessionService, workspaceService, status }) => {
      const name = body.name.trim();
      const nameError = getWorkspaceNameError(name);

      if (nameError) {
        return status(400, {
          error: {
            code: "validation_error",
            message: nameError,
          },
        });
      }

      await sessionService.ensureProfile({
        id: authSession.user.id,
        email: authSession.user.email,
        emailVerified: authSession.user.emailVerified,
        name: authSession.user.name,
        avatarUrl: authSession.user.image ?? null,
      });

      const userContext = await workspaceService.getActiveWorkspaceContext(
        authSession.user.id,
      );

      if (!userContext) {
        return status(401, {
          error: { code: "unauthorized", message: "Unauthorized" },
        });
      }

      await workspaceService.createWorkspace(userContext.user, name);
      const next = await workspaceService.getWorkspaceListWithActive(
        userContext.user.id,
      );

      if (!next) {
        return status(404, {
          error: {
            code: "workspace_not_found",
            message: "Workspace not found",
          },
        });
      }

      return status(201, {
        workspace: next.workspaces.find(
          (workspace) => workspace.id === next.activeWorkspaceId,
        )!,
        workspaces: next.workspaces,
        activeWorkspaceId: next.activeWorkspaceId,
      });
    },
    {
      body: workspaceModel.createBody,
      detail: {
        summary: "Create workspace",
        description:
          "Creates a workspace, provisions owner membership and an internal free subscription, then activates it.",
      },
      response: {
        201: workspaceModel.workspaceResponse,
        400: workspaceModel.validationError,
        401: workspaceModel.unauthorizedError,
        404: workspaceModel.workspaceNotFoundError,
      },
    },
  )
  .post(
    "/active",
    async ({ body, identity, workspaceService, status }) => {
      const workspace = await workspaceService.setActiveWorkspace(
        identity.authUserId,
        body.workspaceId,
      );

      if (!workspace) {
        return status(404, {
          error: {
            code: "workspace_not_found",
            message: "Workspace not found",
          },
        });
      }

      const next = await workspaceService.getWorkspaceListWithActive(
        identity.authUserId,
      );

      if (!next) {
        return status(404, {
          error: {
            code: "workspace_not_found",
            message: "Workspace not found",
          },
        });
      }

      return {
        workspace: next.workspaces.find(
          (item) => item.id === next.activeWorkspaceId,
        )!,
        workspaces: next.workspaces,
        activeWorkspaceId: next.activeWorkspaceId,
      };
    },
    {
      body: workspaceModel.setActiveBody,
      detail: {
        summary: "Set active workspace",
        description:
          "Sets the active workspace for the authenticated user after validating membership.",
      },
      response: {
        200: workspaceModel.workspaceResponse,
        401: workspaceModel.unauthorizedError,
        404: workspaceModel.workspaceNotFoundError,
      },
    },
  );
