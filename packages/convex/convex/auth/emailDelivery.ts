import { env } from "./env";

export async function sendAuthEmail({
  to,
  subject,
  preview,
  actionUrl,
  actionLabel,
}: {
  to: string;
  subject: string;
  preview: string;
  actionUrl: string;
  actionLabel: string;
}) {
  const apiKey = env("RESEND_API_KEY");
  const from = env("AQSHA_EMAIL_FROM");
  if (!apiKey || !from) {
    throw new Error("Resend email delivery is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text: `${preview}\n\n${actionLabel}: ${actionUrl}\n\nJika kamu tidak meminta ini, abaikan email ini.`,
      html: renderAuthEmail({ preview, actionUrl, actionLabel }),
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Resend email failed: ${details || response.statusText}`);
  }
}

function renderAuthEmail({
  preview,
  actionUrl,
  actionLabel,
}: {
  preview: string;
  actionUrl: string;
  actionLabel: string;
}) {
  const safePreview = escapeHtml(preview);
  const safeUrl = escapeHtml(actionUrl);
  const safeLabel = escapeHtml(actionLabel);
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f7f1e8;padding:32px;font-family:Inter,Arial,sans-serif;color:#1f1b16">
    <main style="max-width:520px;margin:0 auto;border:1px solid #e5d8c8;border-radius:14px;background:#fffaf3;padding:28px">
      <p style="margin:0 0 16px;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#6f5d4c">Aqsha</p>
      <p style="margin:0 0 22px;font-size:16px;line-height:1.6">${safePreview}</p>
      <a href="${safeUrl}" style="display:inline-block;border-radius:10px;background:#1f1b16;color:#fffaf3;padding:12px 16px;text-decoration:none;font-size:14px;font-weight:700">${safeLabel}</a>
      <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#776a5d">Jika tombol tidak berfungsi, buka tautan ini: ${safeUrl}</p>
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
