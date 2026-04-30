type EdenErrorValue = {
  error?: {
    message?: unknown;
  };
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getEdenErrorMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  if (!error) {
    return fallbackMessage;
  }

  if (isObject(error)) {
    if ("value" in error) {
      const value = error.value;

      if (isObject(value)) {
        const apiError = (value as EdenErrorValue).error;

        if (isObject(apiError) && typeof apiError.message === "string") {
          return apiError.message;
        }
      }

      if (typeof value === "string") {
        return value;
      }
    }

    if ("status" in error && typeof error.status === "number") {
      return `${fallbackMessage} Status ${error.status}.`;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallbackMessage;
}
