import { Elysia } from "elysia";
import { exampleModel } from "./model";
import { getExampleService } from "./service";

export const exampleModule = new Elysia({
  prefix: "/example",
  name: "module.example",
}).get(
  "/",
  () => getExampleService(),
  {
    response: exampleModel.exampleResponse,
  },
);
