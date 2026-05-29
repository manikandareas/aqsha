export type UrlArtifactStatus = "pending" | "ready" | "failed";

export type UrlArtifactDisplayInput = {
  status: UrlArtifactStatus;
  title?: string;
  description?: string;
  siteName?: string;
  normalizedUrl: string;
  failureReason?: string;
  readableText?: string;
};

export function urlArtifactDisplayModel(input: UrlArtifactDisplayInput) {
  if (input.status === "pending") {
    return {
      label: "Pending",
      tone: "muted" as const,
      summary: input.description ?? "Extraction is running.",
      canRetry: false,
    };
  }
  if (input.status === "failed") {
    return {
      label: "Failed",
      tone: "destructive" as const,
      summary: input.failureReason ?? "Extraction failed.",
      canRetry: true,
    };
  }
  return {
    label: "Ready",
    tone: "ready" as const,
    summary: input.description ?? input.readableText ?? input.normalizedUrl,
    canRetry: false,
  };
}
