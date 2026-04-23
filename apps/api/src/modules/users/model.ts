export interface ClerkProfileInput {
  clerkUserId: string;
  authTokenIdentifier: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}
