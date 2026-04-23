export function getDefaultWorkspaceName(input: {
  name: string | null;
  email: string;
}): string {
  const displayName =
    input.name?.trim() || input.email.split("@")[0]?.trim() || "My";

  return `${displayName} Workspace`;
}
