import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { errorPlugin } from "./lib/errors";
import { observability } from "./plugins/observability";
import { admin } from "./routes/admin";
import { artifacts } from "./routes/artifacts";
import { billing } from "./routes/billing";
import { feed } from "./routes/feed";
import { folders } from "./routes/folders";
import { health } from "./routes/health";
import { onboarding } from "./routes/onboarding";
import { papers } from "./routes/papers";
import { security } from "./routes/security";
import { threads } from "./routes/threads";
import { users } from "./routes/users";
import { webhooks } from "./routes/webhooks";
import { workspaces } from "./routes/workspaces";

export const app = new Elysia()
  .use(observability)
  .use(errorPlugin)
  .use(cors())
  .use(openapi())
  .use(health)
  .use(users)
  .use(security)
  .use(onboarding)
  .use(webhooks)
  .use(billing)
  .use(workspaces)
  .use(folders)
  .use(artifacts)
  .use(threads)
  .use(feed)
  .use(papers)
  .use(admin);

/** Sumber type untuk Eden Treaty (lihat `./client`). Side-effect free: bootstrap listen ada di `./server`. */
export type App = typeof app;
