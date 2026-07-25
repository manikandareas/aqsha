import { throwAppError } from "@aqsha/db";

export type WaitlistEmailSender = (input: {
  to: string;
  verificationUrl: string;
  expiresAt: number;
}) => Promise<void>;

/** Pure HTML renderer — bisa diuji tanpa jaringan. */
export function renderedVerificationEmail(verificationUrl: string, expiresAt: number): string {
  const expiresLabel = new Date(expiresAt).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });
  return `<!DOCTYPE html>
<html lang="id">
<body style="font-family: system-ui, sans-serif; line-height: 1.5; color: #111;">
  <p>Halo,</p>
  <p>Konfirmasikan pendaftaran waitlist <strong>Aqsha</strong> dengan menekan tautan berikut:</p>
  <p><a href="${escapeHtml(verificationUrl)}">${escapeHtml(verificationUrl)}</a></p>
  <p>Tautan berlaku sampai ${escapeHtml(expiresLabel)} (WIB).</p>
  <p>Email ini hanya untuk notifikasi peluncuran Aqsha — bukan newsletter marketing.</p>
  <p>Jika kamu tidak mendaftar, abaikan email ini.</p>
  <p>— Tim Aqsha</p>
</body>
</html>`;
}

/**
 * Production `WaitlistEmailSender` via Resend HTTP API (tanpa SDK).
 * Env: `RESEND_API_KEY`, `WAITLIST_FROM_EMAIL`.
 */
export const sendWaitlistVerificationEmail: WaitlistEmailSender = async (input) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.WAITLIST_FROM_EMAIL;
  if (!apiKey || !from) {
    throwAppError({
      code: "waitlist_email_config_missing",
      message: "Konfigurasi email waitlist belum lengkap.",
      severity: "error",
      status: 500,
    });
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: "Konfirmasi waitlist Aqsha",
      html: renderedVerificationEmail(input.verificationUrl, input.expiresAt),
    }),
  });

  if (!response.ok) {
    // Jangan teruskan body provider ke client.
    throwAppError({
      code: "waitlist_email_send_failed",
      message: "Email verifikasi gagal dikirim. Coba lagi nanti.",
      severity: "error",
      status: 502,
    });
  }
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
