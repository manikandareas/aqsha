import { Elysia } from "elysia";
import { exampleModule } from "./modules/example";
import { healthModule } from "./modules/health";

export const app = new Elysia({
  name: "@aqsha/api",
})
  .use(healthModule)
  .use(exampleModule);
