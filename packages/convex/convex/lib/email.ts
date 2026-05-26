type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

const resendEndpoint = "https://api.resend.com/emails";

export async function sendTransactionalEmail(message: TransactionalEmail) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AQSHA_EMAIL_FROM;

  if (!apiKey || !from) {
    throw new Error("Email delivery is not configured. Set RESEND_API_KEY and AQSHA_EMAIL_FROM.");
  }

  const response = await fetch(resendEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend email failed: ${response.status} ${body}`);
  }
}

export function renderActionEmail({
  title,
  intro,
  actionLabel,
  actionUrl,
  outro,
}: {
  title: string;
  intro: string;
  actionLabel: string;
  actionUrl: string;
  outro: string;
}) {
  const text = `${intro}\n\n${actionLabel}: ${actionUrl}\n\n${outro}`;
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.6;color:#1f1d1a">
      <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>
      <p>${escapeHtml(intro)}</p>
      <p>
        <a href="${escapeAttribute(actionUrl)}" style="display:inline-block;border-radius:8px;background:#1f1d1a;color:#fff;padding:10px 14px;text-decoration:none">
          ${escapeHtml(actionLabel)}
        </a>
      </p>
      <p style="color:#6f6860;font-size:13px">${escapeHtml(outro)}</p>
      <p style="color:#6f6860;font-size:12px">Jika tombol tidak bekerja, buka tautan ini: ${escapeHtml(actionUrl)}</p>
    </div>
  `;

  return { text, html };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
