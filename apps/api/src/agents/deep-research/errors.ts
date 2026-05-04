import type { TrustedScriptError, TrustedScriptErrorCode } from "../skills";

export const researchErrorClasses = [
  "validation",
  "sandbox",
  "dependency",
  "render",
  "uploadthing",
  "model_tool_misuse",
  "unknown",
] as const;

export type ResearchErrorClass = (typeof researchErrorClasses)[number];

export type ClassifiedResearchErrorInput = {
  errorClass: ResearchErrorClass;
  errorCode: string;
  message: string;
  retryable?: boolean;
  developerDetail?: unknown;
  cause?: unknown;
};

export class ClassifiedResearchError extends Error {
  readonly errorClass: ResearchErrorClass;
  readonly errorCode: string;
  readonly retryable: boolean;
  readonly developerDetail: unknown;

  constructor(input: ClassifiedResearchErrorInput) {
    super(input.message, { cause: input.cause });
    this.name = "ClassifiedResearchError";
    this.errorClass = input.errorClass;
    this.errorCode = input.errorCode;
    this.retryable = input.retryable ?? defaultRetryable(input.errorClass);
    this.developerDetail =
      input.developerDetail ?? developerDetailForUnknown(input.cause ?? input.message);
  }
}

export function classifyTrustedScriptError(
  error: TrustedScriptError,
): ClassifiedResearchError {
  const errorClass = researchClassForTrustedScriptCode(error.code);

  return new ClassifiedResearchError({
    errorClass,
    errorCode: error.code,
    message: error.message,
    retryable: retryableTrustedScriptCode(error.code, errorClass),
    developerDetail: {
      code: error.code,
      message: error.message,
      detail: error.detail ?? null,
    },
  });
}

export function classifyResearchError(
  error: unknown,
  fallbackClass: ResearchErrorClass = "unknown",
  fallbackCode?: string,
): ClassifiedResearchError {
  if (error instanceof ClassifiedResearchError) {
    return error;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown Deep Research failure.";

  return new ClassifiedResearchError({
    errorClass: fallbackClass,
    errorCode: fallbackCode ?? `${fallbackClass}_failure`,
    message,
    retryable: defaultRetryable(fallbackClass),
    developerDetail: developerDetailForUnknown(error),
    cause: error,
  });
}

export function developerDetailForUnknown(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

function researchClassForTrustedScriptCode(
  code: TrustedScriptErrorCode,
): ResearchErrorClass {
  switch (code) {
    case "timeout":
    case "sandbox_create_failed":
    case "artifact_retrieval_failed":
      return "sandbox";
    case "unsupported_runtime":
    case "sandbox_dependency_failed":
      return "dependency";
    case "unknown_skill":
    case "unknown_script":
    case "invalid_script_id":
    case "args_limit_exceeded":
      return "model_tool_misuse";
    case "script_failed":
    case "artifact_missing":
    case "output_limit_exceeded":
      return "render";
    case "unknown":
      return "unknown";
  }
}

function retryableTrustedScriptCode(
  code: TrustedScriptErrorCode,
  errorClass: ResearchErrorClass,
): boolean {
  if (code === "timeout" || code === "sandbox_create_failed" || code === "artifact_retrieval_failed") {
    return true;
  }

  return defaultRetryable(errorClass);
}

function defaultRetryable(errorClass: ResearchErrorClass): boolean {
  return errorClass === "sandbox" || errorClass === "render" || errorClass === "uploadthing";
}
