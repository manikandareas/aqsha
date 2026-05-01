import type {
  SubscriptionRecord,
  UserRecord,
  WorkspaceRecord,
} from "@aqsha/db";
import type {
  ActiveWorkspaceContext,
  WorkspaceListItem,
  WorkspaceRepository,
} from "./repository";

export class WorkspaceService {
  constructor(private readonly repository: WorkspaceRepository) {}

  getOwnedWorkspace(userId: string): Promise<WorkspaceRecord | null> {
    return this.repository.getOwnedWorkspace(userId);
  }

  getCurrentSubscription(
    workspaceId: string,
  ): Promise<SubscriptionRecord | null> {
    return this.repository.getCurrentSubscription(workspaceId);
  }

  ensureDefaultWorkspace(user: UserRecord): Promise<WorkspaceRecord> {
    return this.repository.ensureDefaultWorkspace(user);
  }

  ensureNamedOwnedWorkspace(
    user: UserRecord,
    workspaceName: string,
  ): Promise<WorkspaceRecord> {
    return this.repository.ensureNamedOwnedWorkspace(user, workspaceName);
  }

  getActiveWorkspaceContext(
    userId: string,
  ): Promise<ActiveWorkspaceContext | null> {
    return this.repository.getActiveWorkspaceContext(userId);
  }

  getWorkspaceList(userId: string): Promise<WorkspaceListItem[]> {
    return this.repository.getWorkspaceList(userId);
  }

  getWorkspaceListWithActive(
    userId: string,
  ): Promise<{ workspaces: WorkspaceListItem[]; activeWorkspaceId: string } | null> {
    return this.repository.getWorkspaceListWithActive(userId);
  }

  createWorkspace(user: UserRecord, name: string): Promise<WorkspaceRecord> {
    return this.repository.createWorkspace(user, name);
  }

  setActiveWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceRecord | null> {
    return this.repository.setActiveWorkspace(userId, workspaceId);
  }
}
