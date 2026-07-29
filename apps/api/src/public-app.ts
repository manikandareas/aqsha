import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { errorPlugin } from "./lib/errors";
import { observability } from "./plugins/observability";
import { publicHealth } from "./routes/public-health";
import { waitlist } from "./routes/waitlist";

function allowedOrigins(): Set<string> {
  const raw = process.env.PUBLIC_CORS_ORIGINS ?? process.env.PUBLIC_SITE_URL ?? "";
  return new Set(
    raw
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
}

export function allowsPublicOrigin(request: Request): boolean {
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  return origin !== undefined && allowedOrigins().has(origin);
}

/** Public surface deliberately excludes product routes and their auth, AI, and storage dependencies. */
export const publicApp = new Elysia()
  .use(observability)
  .use(errorPlugin)
  .use(
    cors({
      origin: allowsPublicOrigin,
      methods: ["POST", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
      credentials: false,
      maxAge: 600,
    }),
  )
  .use(publicHealth)
  .use(waitlist);

export type PublicApp = typeof publicApp;
