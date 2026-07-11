import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { errorPlugin } from "./lib/errors";
import { observability } from "./plugins/observability";
import { admin } from "./routes/admin";
import { artifacts } from "./routes/artifacts";
import { billing } from "./routes/billing";
import { blocknoteAi } from "./routes/blocknote-ai";
import { citations } from "./routes/citations";
import { explore } from "./routes/explore";
import { feed } from "./routes/feed";
import { folders } from "./routes/folders";
import { health } from "./routes/health";
import { onboarding } from "./routes/onboarding";
import { papers } from "./routes/papers";
import { preferences } from "./routes/preferences";
import { security } from "./routes/security";
import { threads } from "./routes/threads";
import { users } from "./routes/users";
import { webhooks } from "./routes/webhooks";
import { workspaces } from "./routes/workspaces";

export const app = new Elysia()
  .use(observability)
  .use(errorPlugin)
  // exposeHeaders eksplisit: default `true` justru memantulkan nama header REQUEST
  // (quirk @elysiajs/cors), sehingga accept-ranges/content-range TAK ter-expose lintas
  // origin → pdf.js gagal deteksi range & mengunduh PDF utuh. Daftar ini adalah kontrak
  // lintas-origin: setiap route baru yang ingin header respons custom-nya DIBACA klien
  // (mis. X-Next-Cursor) harus menambahkannya di sini, kalau tidak header itu ada di wire
  // tapi tak terbaca Eden client (gagal senyap).
  .use(cors({ exposeHeaders: ["Content-Type", "Content-Length", "Accept-Ranges", "Content-Range"] }))
  .use(openapi())
  .use(health)
  .use(users)
  .use(security)
  .use(onboarding)
  .use(preferences)
  .use(webhooks)
  .use(billing)
  .use(workspaces)
  .use(folders)
  .use(artifacts)
  .use(citations)
  .use(blocknoteAi)
  .use(threads)
  .use(feed)
  .use(explore)
  .use(papers)
  .use(admin);

/** Sumber type untuk Eden Treaty (lihat `./client`). Side-effect free: bootstrap listen ada di `./server`. */
export type App = typeof app;
