import type {
  SubscriptionRecord,
  UserRecord,
  WorkspaceRecord,
} from "@aqsha/db";
import { workspaceRepository } from "./repository";

export class WorkspaceService {
  constructor(private readonly repository = workspaceRepository) {}

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
}

export const workspaceService = new WorkspaceService();
