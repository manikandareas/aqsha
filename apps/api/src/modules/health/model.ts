import { t, type UnwrapSchema } from "elysia";

export const healthModel = {
  healthResponse: t.Object({
    status: t.Literal("ok"),
    service: t.String(),
    timestamp: t.String({
      format: "date-time",
    }),
  }),
} as const;

export type HealthModel = {
  [K in keyof typeof healthModel]: UnwrapSchema<(typeof healthModel)[K]>;
};
