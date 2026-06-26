/**
 * Pesan dari error Clerk frontend SDK. Bentuk: `{ errors: [{ longMessage, message }] }`
 * (beda dari error Eden yang ditangani `readableApiErrorMessage`). Duck-typed agar
 * tak perlu impor type-guard. Reverification yang dibatalkan user → fallback senyap.
 */
export function clerkErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "errors" in error) {
    const first = (error as { errors?: Array<{ longMessage?: string; message?: string }> })
      .errors?.[0];
    const msg = first?.longMessage ?? first?.message;
    if (typeof msg === "string" && msg.length > 0) return msg;
  }
  return fallback;
}
