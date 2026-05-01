import type {
  SubscriptionRecord,
  UserRecord,
  WorkspaceRecord,
} from "@aqsha/db";
import type { WorkspaceRepository } from "./repository";

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
}
