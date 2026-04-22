import { Elysia } from "elysia";
import { healthModel } from "./model";
import { HealthService } from "./service";

export const healthModule = new Elysia({
  prefix: "/health",
  name: "module.health",
}).get(
  "/",
  () => HealthService.getHealth(),
  {
    response: healthModel.healthResponse,
  },
);
