import { Elysia } from "elysia";
import { healthModule } from "./modules/health";
import { journalsModule } from "./modules/journals";
import { sessionModule } from "./modules/session";
import openapi from "@elysiajs/openapi";

export const app = new Elysia({
  name: "@aqsha/api",
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
  .use(journalsModule);

export type ApiApp = typeof app;
