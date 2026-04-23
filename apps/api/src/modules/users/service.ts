import type { UserRecord } from "@aqsha/db";
import type { ClerkProfileInput } from "./model";
import { userRepository } from "./repository";

export type { ClerkProfileInput } from "./model";

export class UserService {
  constructor(private readonly repository = userRepository) {}

  getByIdentity(
    authTokenIdentifier: string,
    clerkUserId: string,
  ): Promise<UserRecord | null> {
    return this.repository.getByIdentity(authTokenIdentifier, clerkUserId);
  }

  async ensureProfile(input: ClerkProfileInput): Promise<UserRecord> {
    return this.repository.ensureProfile(input);
  }
}

export const userService = new UserService();
