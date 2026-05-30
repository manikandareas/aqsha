import { ConvexError } from "convex/values";

export type AppErrorSeverity = "info" | "warning" | "error";

export type AppErrorData = {
  message: string;
  code: string;
  severity?: AppErrorSeverity;
  field?: string;
};

export function appError(data: AppErrorData): ConvexError<AppErrorData> {
  return new ConvexError(data);
}

export function throwAppError(data: AppErrorData): never {
  throw appError(data);
}
