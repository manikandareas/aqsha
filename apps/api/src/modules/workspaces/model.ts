import { t, type UnwrapSchema } from "elysia";

const planCode = t.Union([t.Literal("free"), t.Literal("pro")]);
const workspaceRole = t.Union([t.Literal("owner"), t.Literal("member")]);

const workspaceSwitcherItem = t.Object({
  id: t.String(),
  name: t.String(),
  slug: t.Union([t.String(), t.Null()]),
  role: workspaceRole,
  planCode,
  isActive: t.Boolean(),
});

const workspaceResponse = t.Object({
  workspace: workspaceSwitcherItem,
  workspaces: t.Array(workspaceSwitcherItem),
  activeWorkspaceId: t.String(),
});

const validationError = t.Object({
  error: t.Object({
    code: t.Literal("validation_error"),
    message: t.String(),
  }),
});

const unauthorizedError = t.Object({
  error: t.Object({
    code: t.Literal("unauthorized"),
    message: t.String(),
  }),
});

const workspaceNotFoundError = t.Object({
  error: t.Object({
    code: t.Literal("workspace_not_found"),
    message: t.String(),
  }),
});

export function getDefaultWorkspaceName(input: {
  name: string | null;
  email: string;
}): string {
  const displayName =
    input.name?.trim() || input.email.split("@")[0]?.trim() || "My";

  return `${displayName} Workspace`;
}

export const workspaceModel = {
  createBody: t.Object({
    name: t.String(),
  }),
  setActiveBody: t.Object({
    workspaceId: t.String(),
  }),
  workspaceSwitcherItem,
  workspaceResponse,
  validationError,
  unauthorizedError,
  workspaceNotFoundError,
};

export type WorkspaceModel = {
  [K in keyof typeof workspaceModel]: UnwrapSchema<(typeof workspaceModel)[K]>;
};
