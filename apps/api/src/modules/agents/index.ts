import { Elysia } from "elysia";
import { allowedModels } from "../../agents/model";
import { servicesPlugin } from "../../plugins/services";
import { agentsModel } from "./model";

export const agentsModule = new Elysia({
  prefix: "/agents",
  name: "module.agents",
  tags: ["agents"],
})
  .use(servicesPlugin)
  .get("/health", () => ({ ok: true, service: "agents" as const, models: [...allowedModels()] }), {
    detail: {
      summary: "Agent runtime health",
      description: "Returns API-owned agent runtime health and configured model IDs.",
    },
    response: {
      200: agentsModel.health,
    },
  });
