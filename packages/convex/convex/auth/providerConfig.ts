import { env } from "./env";

export type AuthProviderConfiguration = {
  emailDeliveryConfigured: boolean;
  oauthProviders: {
    github: boolean;
    google: boolean;
  };
};

export function getSocialProviders() {
  const providers: {
    github?: { clientId: string; clientSecret: string };
    google?: { clientId: string; clientSecret: string };
  } = {};

  const githubClientId = env("GITHUB_CLIENT_ID");
  const githubClientSecret = env("GITHUB_CLIENT_SECRET");
  if (githubClientId && githubClientSecret) {
    providers.github = {
      clientId: githubClientId,
      clientSecret: githubClientSecret,
    };
  }

  const googleClientId = env("GOOGLE_CLIENT_ID");
  const googleClientSecret = env("GOOGLE_CLIENT_SECRET");
  if (googleClientId && googleClientSecret) {
    providers.google = {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    };
  }

  return providers;
}

export function getPublicAuthConfiguration(): AuthProviderConfiguration {
  return {
    emailDeliveryConfigured: Boolean(env("RESEND_API_KEY") && env("AQSHA_EMAIL_FROM")),
    oauthProviders: {
      github: Boolean(env("GITHUB_CLIENT_ID") && env("GITHUB_CLIENT_SECRET")),
      google: Boolean(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET")),
    },
  };
}
