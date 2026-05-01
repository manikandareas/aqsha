import type {
  SubscriptionRecord,
  UserRecord,
  WorkspaceRecord,
} from "@aqsha/db";
import { UserService, type AuthProfileInput } from "../users/service";
import { WorkspaceService } from "../workspaces/service";

export const PLAN_LIMITS = {
  free: {
    aiActions: 10,
    exports: 3,
    sourceUploads: 3,
  },
  pro: {
    aiActions: 100,
    exports: 30,
    sourceUploads: 30,
  },
} as const;

type PlanCode = keyof typeof PLAN_LIMITS;

interface ProvisionedSession {
  user: UserRecord;
  workspace: WorkspaceRecord;
  subscription: SubscriptionRecord | null;
  workspaces: Awaited<ReturnType<WorkspaceService["getWorkspaceList"]>>;
  activeWorkspaceId: string;
}

export class SessionService {
  constructor(
    private readonly userService: UserService,
    private readonly workspaceService: WorkspaceService,
  ) {}
  async ensureProfile(input: AuthProfileInput): Promise<void> {
    const user = await this.userService.ensureProfile(input);
    await this.workspaceService.ensureDefaultWorkspace(user);
  }

  async getStarted(input: AuthProfileInput & { workspaceName: string }) {
    const user = await this.userService.ensureProfile(input);
    await this.workspaceService.ensureNamedOwnedWorkspace(
      user,
      input.workspaceName,
    );
    await this.userService.completeOnboarding(user.id);

    return this.getBootstrap(input.id);
  }

  async getBootstrap(authUserId: string) {
    const session = await this.getProvisionedSession(authUserId);

    if (!session) {
      return null;
    }

    const planCode = this.getPlanCode(session.subscription);
    const limits = PLAN_LIMITS[planCode];
    const onboarding = this.buildOnboarding(session.user, session.workspace);

    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        avatarUrl: session.user.avatarUrl,
        planCode,
      },
      workspace: {
        id: session.workspace.id,
        userId: session.user.id,
        ownerUserId: session.workspace.ownerUserId,
        name: session.workspace.name,
        slug: session.workspace.slug,
      },
      workspaces: session.workspaces,
      activeWorkspaceId: session.activeWorkspaceId,
      plan: {
        code: planCode,
        label: planCode === "pro" ? "Pro" : "Free",
      },
      usage: {
        period: this.getCurrentPeriod(),
        aiActionsUsed: session.workspace.aiActionsUsed,
        aiActionsReserved: session.workspace.aiActionsReserved,
        aiActionsRemaining: this.remaining(
          limits.aiActions,
          session.workspace.aiActionsUsed,
          session.workspace.aiActionsReserved,
        ),
        exportsRemaining: this.remaining(
          limits.exports,
          session.workspace.exportsUsed,
        ),
        sourceUploadsRemaining: this.remaining(
          limits.sourceUploads,
          session.workspace.sourceUploadsUsed,
        ),
      },
      journalStats: {
        activeCount: session.workspace.activeJournalCount,
        archivedCount: session.workspace.archivedJournalCount,
      },
      onboarding,
    };
  }

  async getOnboarding(authUserId: string) {
    const session = await this.getProvisionedSession(authUserId);

    if (!session) {
      return null;
    }

    return this.buildOnboarding(session.user, session.workspace);
  }

  private async getProvisionedSession(
    authUserId: string,
  ): Promise<ProvisionedSession | null> {
    const user = await this.userService.getByAuthUserId(authUserId);

    if (!user) {
      return null;
    }

    const context = await this.workspaceService.getActiveWorkspaceContext(user.id);

    if (!context) {
      return null;
    }

    const subscription = await this.workspaceService.getCurrentSubscription(
      context.workspace.id,
    );
    const workspaceList = await this.workspaceService.getWorkspaceListWithActive(
      user.id,
    );

    if (!workspaceList) {
      return null;
    }

    return {
      user,
      workspace: context.workspace,
      subscription,
      workspaces: workspaceList.workspaces,
      activeWorkspaceId: workspaceList.activeWorkspaceId,
    };
  }

  private getPlanCode(subscription: SubscriptionRecord | null): PlanCode {
    if (
      subscription &&
      (subscription.status === "active" || subscription.status === "trialing")
    ) {
      return subscription.planCode;
    }

    return "free";
  }

  private buildOnboarding(user: UserRecord, workspace: WorkspaceRecord) {
    const shouldShow =
      user.onboardingCompletedAt === null && workspace.activeJournalCount === 0;

    return {
      shouldShow,
      reason: shouldShow ? "missing_first_journal" : null,
    } as const;
  }

  private getCurrentPeriod(): string {
    return new Date().toISOString().slice(0, 7);
  }

  private remaining(limit: number, used: number, reserved = 0): number {
    return Math.max(limit - used - reserved, 0);
  }
}
