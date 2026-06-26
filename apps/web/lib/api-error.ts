/**
 * Ekstrak pesan dari error Eden Treaty. Bentuk error: `{ status, value }` di mana
 * `value` = body terstruktur backend `{ message, code, ... }`. Fallback aman bila
 * bukan error terstruktur.
 */
export function readableApiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "value" in error) {
    const value = (error as { value?: unknown }).value;
    if (
      value &&
      typeof value === "object" &&
      "message" in value &&
      typeof (value as { message?: unknown }).message === "string"
    ) {
      return (value as { message: string }).message;
    }
  }
  return fallback;
}
