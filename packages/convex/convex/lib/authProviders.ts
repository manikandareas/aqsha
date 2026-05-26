const defaultAvatarBaseUrl = "https://api.dicebear.com/9.x/big-ears-neutral/svg";
const githubClientId = process.env.GITHUB_CLIENT_ID;
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

export const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";

export function configuredSocialProviders() {
  return {
    ...(isGithubConfigured()
      ? {
          github: {
            clientId: githubClientId!,
            clientSecret: githubClientSecret!,
          },
        }
      : {}),
    ...(isGoogleConfigured()
      ? {
          google: {
            clientId: googleClientId!,
            clientSecret: googleClientSecret!,
          },
        }
      : {}),
  };
}

export function getOAuthProviderCapabilities() {
  return {
    github: isGithubConfigured(),
    google: isGoogleConfigured(),
  };
}

export function getDefaultAvatarUrl(name: string) {
  const seed = name.trim() || "Aqsha User";
  return `${defaultAvatarBaseUrl}?seed=${encodeURIComponent(seed)}`;
}

function isGithubConfigured() {
  return Boolean(githubClientId && githubClientSecret);
}

function isGoogleConfigured() {
  return Boolean(googleClientId && googleClientSecret);
}
