import type { SubscriptionRecord, UserRecord } from "@aqsha/db";
import { UserService, type AuthProfileInput } from "../users/service";

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
  subscription: SubscriptionRecord | null;
}

export class SessionService {
  constructor(private readonly userService: UserService) {}

  async ensureProfile(input: AuthProfileInput): Promise<void> {
    await this.userService.ensureProfile(input);
  }

  async getStarted(input: AuthProfileInput) {
    const user = await this.userService.ensureProfile(input);
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
    const onboarding = this.buildOnboarding(session.user);

    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        avatarUrl: session.user.avatarUrl,
        planCode,
      },
      plan: {
        code: planCode,
        label: planCode === "pro" ? "Pro" : "Free",
      },
      usage: {
        period: this.getCurrentPeriod(),
        aiActionsUsed: session.user.aiActionsUsed,
        aiActionsReserved: session.user.aiActionsReserved,
        aiActionsRemaining: this.remaining(
          limits.aiActions,
          session.user.aiActionsUsed,
          session.user.aiActionsReserved,
        ),
        exportsRemaining: this.remaining(limits.exports, session.user.exportsUsed),
        sourceUploadsRemaining: this.remaining(
          limits.sourceUploads,
          session.user.sourceUploadsUsed,
        ),
      },
      journalStats: {
        activeCount: session.user.activeJournalCount,
        archivedCount: session.user.archivedJournalCount,
      },
      onboarding,
    };
  }

  async getOnboarding(authUserId: string) {
    const session = await this.getProvisionedSession(authUserId);

    if (!session) {
      return null;
    }

    return this.buildOnboarding(session.user);
  }

  private async getProvisionedSession(
    authUserId: string,
  ): Promise<ProvisionedSession | null> {
    const user = await this.userService.getByAuthUserId(authUserId);

    if (!user) {
      return null;
    }

    const subscription = await this.userService.getCurrentSubscription(user.id);

    return {
      user,
      subscription,
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

  private buildOnboarding(user: UserRecord) {
    const shouldShow =
      user.onboardingCompletedAt === null && user.activeJournalCount === 0;

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
