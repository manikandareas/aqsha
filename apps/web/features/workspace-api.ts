import { api } from "@/lib/eden";

export async function createWorkspace(name: string): Promise<void> {
  const response = await api.workspaces.post({ name });

  if (response.error) {
    throw response.error;
  }
}

export async function setActiveWorkspace(workspaceId: string): Promise<void> {
  const response = await api.workspaces.active.post({ workspaceId });

  if (response.error) {
    throw response.error;
  }
}
