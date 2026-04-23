import { Elysia } from "elysia";
import { healthModule } from "./modules/health";
import { sessionModule } from "./modules/session";
import openapi from "@elysiajs/openapi";

export const app = new Elysia({
  name: "@aqsha/api",
})
  .use(openapi())
  .use(healthModule)
  .use(sessionModule);

export type ApiApp = typeof app;
