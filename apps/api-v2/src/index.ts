import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { health } from "./routes/health";

export const app = new Elysia()
  .use(cors())
  .use(openapi())
  .use(health);

/** Sumber type untuk Eden Treaty (lihat `./client`). Side-effect free: bootstrap listen ada di `./server`. */
export type App = typeof app;
