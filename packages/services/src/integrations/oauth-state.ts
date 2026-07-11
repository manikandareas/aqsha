import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { AppError } from "@aqsha/db";
import type { IntegrationProvider } from "@aqsha/db";

/**
 * State OAuth ditandatangani HMAC-SHA256 (reuse `AQSHA_INTEGRATION_ENC_KEY` sebagai
 * secret, domain-terpisah dari enkripsi credential). State mengikat owner + provider
 * + nonce + expiry supaya callback tak bisa dipalsukan / di-replay lintas user.
 * Callback OAuth dipanggil browser (tanpa bearer Clerk) → identitas HANYA dari state ini.
 */
const STATE_TTL_MS = 10 * 60 * 1000; // 10 menit
const STATE_HMAC_DOMAIN = "aqsha:integration:oauth-state:v1";

export type OAuthState = {
  ownerUserId: string;
  provider: IntegrationProvider;
  nonce: string;
  exp: number;
};

function stateSecret(): string {
  const secret = process.env.AQSHA_INTEGRATION_ENC_KEY?.trim();
  if (!secret || secret.length < 16) {
    throw new AppError({
      code: "integration_not_configured",
      message: "AQSHA_INTEGRATION_ENC_KEY belum dikonfigurasi.",
      severity: "error",
      status: 500,
    });
  }
  return `${STATE_HMAC_DOMAIN}:${secret}`;
}

function sign(body: string): string {
  return createHmac("sha256", stateSecret()).update(body).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function signOAuthState(input: {
  ownerUserId: string;
  provider: IntegrationProvider;
}): string {
  const payload: OAuthState = {
    ownerUserId: input.ownerUserId,
    provider: input.provider,
    nonce: randomBytes(16).toString("base64url"),
    exp: Date.now() + STATE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyOAuthState(token: string): OAuthState {
  const [body, sig] = token.split(".");
  if (!body || !sig || !safeEqual(sig, sign(body))) {
    throw new AppError({
      code: "integration_state_invalid",
      message: "State OAuth tidak valid.",
      severity: "warning",
      status: 400,
    });
  }
  let payload: OAuthState;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState;
  } catch {
    throw new AppError({
      code: "integration_state_invalid",
      message: "State OAuth tidak valid.",
      severity: "warning",
      status: 400,
    });
  }
  if (typeof payload.exp !== "number" || payload.exp < Date.now()) {
    throw new AppError({
      code: "integration_state_expired",
      message: "Sesi koneksi kedaluwarsa, coba hubungkan ulang.",
      severity: "warning",
      status: 400,
    });
  }
  return payload;
}
