import type { UserRecord } from "@aqsha/db";
import type { AuthProfileInput } from "./model";
import type { UserRepository } from "./repository";

export type { AuthProfileInput } from "./model";

export class UserService {
  constructor(private readonly repository: UserRepository) {}

  getByAuthUserId(authUserId: string): Promise<UserRecord | null> {
    return this.repository.getByAuthUserId(authUserId);
  }

  async ensureProfile(input: AuthProfileInput): Promise<UserRecord> {
    return this.repository.ensureProfile(input);
  }

  completeOnboarding(userId: string): Promise<UserRecord> {
    return this.repository.completeOnboarding(userId);
  }
}
