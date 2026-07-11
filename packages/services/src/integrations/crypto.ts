import { createDecipheriv, createCipheriv, randomBytes, scryptSync } from "node:crypto";
import { AppError } from "@aqsha/db";

/**
 * Enkripsi credential provider (OAuth token / API key) at-rest, AES-256-GCM.
 * Kunci diturunkan dari `AQSHA_INTEGRATION_ENC_KEY` (secret deployment) via scrypt
 * + salt domain-terpisah — secret string bebas-panjang tetap jadi kunci 32-byte.
 * Ciphertext TIDAK PERNAH di-serialize ke `apps/web`; hanya service yang decrypt.
 *
 * Format: `v1.<iv>.<tag>.<ciphertext>` (base64url). IV acak 12-byte per enkripsi,
 * auth tag GCM mencegah tamper.
 */
const ALGO = "aes-256-gcm";
const KEY_SALT = "aqsha:integration:credentials:v1";
const MIN_SECRET_LENGTH = 16;

let cached: { secret: string; key: Buffer } | null = null;

function encryptionSecret(): string {
  const secret = process.env.AQSHA_INTEGRATION_ENC_KEY?.trim();
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new AppError({
      code: "integration_not_configured",
      message: "AQSHA_INTEGRATION_ENC_KEY belum dikonfigurasi (minimal 16 karakter).",
      severity: "error",
      status: 500,
    });
  }
  return secret;
}

function derivedKey(): Buffer {
  const secret = encryptionSecret();
  if (cached && cached.secret === secret) return cached.key;
  const key = scryptSync(secret, KEY_SALT, 32);
  cached = { secret, key };
  return key;
}

/** True bila enkripsi credential siap dipakai (untuk gate connect di UI). */
export function isIntegrationCryptoConfigured(): boolean {
  const secret = process.env.AQSHA_INTEGRATION_ENC_KEY?.trim();
  return Boolean(secret && secret.length >= MIN_SECRET_LENGTH);
}

export function encryptCredentials(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, derivedKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptCredentials<T>(payload: string): T {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new AppError({
      code: "integration_credentials_corrupt",
      message: "Kredensial integrasi rusak.",
      severity: "error",
      status: 500,
    });
  }
  try {
    const iv = Buffer.from(parts[1] as string, "base64url");
    const tag = Buffer.from(parts[2] as string, "base64url");
    const encrypted = Buffer.from(parts[3] as string, "base64url");
    const decipher = createDecipheriv(ALGO, derivedKey(), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString("utf8")) as T;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError({
      code: "integration_credentials_corrupt",
      message: "Gagal mendekripsi kredensial integrasi.",
      severity: "error",
      status: 500,
    });
  }
}
