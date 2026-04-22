import { t, type UnwrapSchema } from "elysia";

export const exampleModel = {
  exampleResponse: t.Object({
    message: t.String(),
    serviceLabel: t.String(),
    docs: t.String(),
  }),
} as const;

export type ExampleModel = {
  [K in keyof typeof exampleModel]: UnwrapSchema<(typeof exampleModel)[K]>;
};
