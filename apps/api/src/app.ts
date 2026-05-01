import { cors } from "@elysiajs/cors";
import openapi from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { auth } from "./auth";
import { env } from "./config";
import { chatModule } from "./modules/chat";
import { healthModule } from "./modules/health";
import { journalsModule } from "./modules/journals";
import { sessionModule } from "./modules/session";

export const app = new Elysia({
  name: "@aqsha/api",
})
  .use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
      allowedHeaders: ["Content-Type"],
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  )
  .all("/api/auth/*", ({ request }) => auth.handler(request), {
    detail: {
      hide: true,
    },
  })
  .use(
    openapi({
      documentation: {
        info: {
          title: "Aqsha API",
          description: "Aqsha API",
          version: "1.0.0",
        },
      },
    }),
  )
  .use(healthModule)
  .use(sessionModule)
  .use(journalsModule)
  .use(chatModule);

export type ApiApp = typeof app;
