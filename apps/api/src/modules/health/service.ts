import { sharedServiceName, type HealthResponse } from "@aqsha/shared";
import type { HealthModel } from "./model";

export abstract class HealthService {
  static getHealth(): HealthModel["healthResponse"] & HealthResponse {
    return {
      status: "ok",
      service: sharedServiceName,
      timestamp: new Date().toISOString(),
    };
  }
}
