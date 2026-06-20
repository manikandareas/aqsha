import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { errorPlugin } from "./lib/errors";
import { health } from "./routes/health";
import { onboarding } from "./routes/onboarding";
import { users } from "./routes/users";
import { webhooks } from "./routes/webhooks";

export const app = new Elysia()
  .use(errorPlugin)
  .use(cors())
  .use(openapi())
  .use(health)
  .use(users)
  .use(onboarding)
  .use(webhooks);

/** Sumber type untuk Eden Treaty (lihat `./client`). Side-effect free: bootstrap listen ada di `./server`. */
export type App = typeof app;
