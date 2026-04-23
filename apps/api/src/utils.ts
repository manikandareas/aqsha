export function getAuthenticatedIdentity(authObject: {
  userId?: string | null;
  sessionClaims?: { iss?: string } | null;
}): { clerkUserId: string; authTokenIdentifier: string } | null {
  if (!authObject.userId) {
    return null;
  }

  const tokenIdentifier = authObject.sessionClaims?.iss
    ? `${authObject.sessionClaims.iss}|${authObject.userId}`
    : `clerk:${authObject.userId}`;

  return {
    clerkUserId: authObject.userId,
    authTokenIdentifier: tokenIdentifier,
  };
}
