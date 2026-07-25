import { throwAppError } from "@aqsha/db";

/** Token verifikasi berlaku 24 jam. */
export const WAITLIST_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/** Batas panjang field company/university opsional. */
export const WAITLIST_COMPANY_MAX_CHARS = 160;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type WaitlistJoinInput = {
  email: string;
  companyOrUniversity?: string | null;
};

export type NormalizedWaitlistJoinInput = {
  email: string;
  companyOrUniversity: string | null;
};

/** Trim + lowercase email. Tidak memvalidasi format. */
export function normalizeWaitlistEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Normalisasi + validasi input join.
 * Melempar AppError dengan code stabil untuk field-level feedback.
 */
export function normalizeWaitlistJoinInput(input: WaitlistJoinInput): NormalizedWaitlistJoinInput {
  const email = normalizeWaitlistEmail(input.email ?? "");
  if (!email) {
    throwAppError({
      code: "waitlist_email_required",
      message: "Email wajib diisi.",
      severity: "error",
      field: "email",
    });
  }
  if (!EMAIL_RE.test(email)) {
    throwAppError({
      code: "waitlist_email_invalid",
      message: "Format email tidak valid.",
      severity: "error",
      field: "email",
    });
  }

  const rawCompany = input.companyOrUniversity?.trim() ?? "";
  if (rawCompany.length > WAITLIST_COMPANY_MAX_CHARS) {
    throwAppError({
      code: "waitlist_company_too_long",
      message: `Perusahaan atau universitas maksimal ${WAITLIST_COMPANY_MAX_CHARS} karakter.`,
      severity: "error",
      field: "companyOrUniversity",
    });
  }

  return {
    email,
    companyOrUniversity: rawCompany.length > 0 ? rawCompany : null,
  };
}

/** Token acak 32 byte, di-encode base64url (bukan plaintext hash). */
export function createWaitlistVerificationToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

/** SHA-256 hex digest dari token mentah. Jangan pernah persist token mentah. */
export async function hashWaitlistVerificationToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
