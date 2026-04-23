import {
  formatServiceLabel,
  sharedServiceName,
  type ExampleResponse,
} from "@aqsha/shared";
import type { ExampleModel } from "./model";

export function getExampleService(): ExampleModel["exampleResponse"] &
  ExampleResponse {
  return {
    message: "Hello from the Bun + Elysia API. Manik",
    serviceLabel: formatServiceLabel(sharedServiceName),
    docs: "Set NEXT_PUBLIC_API_URL if the frontend should target a different API origin.",
  };
}
