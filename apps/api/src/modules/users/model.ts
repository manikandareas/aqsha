export interface AuthProfileInput {
  id: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
}
