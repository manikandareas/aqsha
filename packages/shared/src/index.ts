export interface HealthResponse {
  status: "ok";
  service: string;
  timestamp: string;
}

export interface ExampleResponse {
  message: string;
  serviceLabel: string;
  docs: string;
}

export const sharedServiceName = "Aqsha API";

export function formatServiceLabel(serviceName: string): string {
  return `${serviceName} via @aqsha/shared`;
}
