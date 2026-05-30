import { ConvexError } from "convex/values";

export type AppErrorSeverity = "info" | "warning" | "error";

export type ReadableConvexError = {
  message: string;
  code?: string;
  severity?: AppErrorSeverity;
  field?: string;
};

type ConvexErrorData = {
  message?: unknown;
  code?: unknown;
  severity?: unknown;
  field?: unknown;
};

export function readableConvexError(
  error: unknown,
  fallback: string,
): ReadableConvexError {
  if (error instanceof ConvexError) {
    return readableConvexErrorData(error.data, fallback);
  }

  return { message: fallback };
}

export function readableConvexErrorMessage(error: unknown, fallback: string) {
  return readableConvexError(error, fallback).message;
}

function readableConvexErrorData(
  data: unknown,
  fallback: string,
): ReadableConvexError {
  if (typeof data === "string" && data.trim()) {
    return { message: data };
  }

  if (isRecord(data)) {
    const payload = data as ConvexErrorData;
    const message = typeof payload.message === "string" && payload.message.trim()
      ? payload.message
      : fallback;
    return {
      message,
      ...(typeof payload.code === "string" && payload.code.trim()
        ? { code: payload.code }
        : {}),
      ...(isSeverity(payload.severity) ? { severity: payload.severity } : {}),
      ...(typeof payload.field === "string" && payload.field.trim()
        ? { field: payload.field }
        : {}),
    };
  }

  return { message: fallback };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSeverity(value: unknown): value is AppErrorSeverity {
  return value === "info" || value === "warning" || value === "error";
}
