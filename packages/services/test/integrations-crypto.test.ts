import { beforeAll, describe, expect, test } from "bun:test";
import {
  decryptCredentials,
  encryptCredentials,
  isIntegrationCryptoConfigured,
} from "../src/integrations/crypto";
import { signOAuthState, verifyOAuthState } from "../src/integrations/oauth-state";

beforeAll(() => {
  process.env.AQSHA_INTEGRATION_ENC_KEY = "test-secret-key-please-change-32chars";
});

describe("integration crypto (AES-256-GCM)", () => {
  test("configured saat secret ada", () => {
    expect(isIntegrationCryptoConfigured()).toBe(true);
  });

  test("encrypt → decrypt roundtrip mempertahankan payload", () => {
    const creds = { provider: "mendeley", accessToken: "a", refreshToken: "b", expiresAt: 123 };
    const encrypted = encryptCredentials(creds);
    expect(encrypted.startsWith("v1.")).toBe(true);
    expect(encrypted).not.toContain("accessToken");
    expect(decryptCredentials<typeof creds>(encrypted)).toEqual(creds);
  });

  test("IV acak → ciphertext berbeda tiap enkripsi", () => {
    const a = encryptCredentials({ x: 1 });
    const b = encryptCredentials({ x: 1 });
    expect(a).not.toBe(b);
  });

  test("tamper ciphertext → decrypt gagal (auth tag)", () => {
    const encrypted = encryptCredentials({ secret: "value" });
    const parts = encrypted.split(".");
    const tampered = `${parts[0]}.${parts[1]}.${parts[2]}.${Buffer.from("evil").toString("base64url")}`;
    expect(() => decryptCredentials(tampered)).toThrow();
  });

  test("format rusak → decrypt gagal", () => {
    expect(() => decryptCredentials("not-a-valid-payload")).toThrow();
  });
});

describe("oauth state (HMAC)", () => {
  test("sign → verify roundtrip mengembalikan owner + provider", () => {
    const token = signOAuthState({ ownerUserId: "user_1", provider: "mendeley" });
    const state = verifyOAuthState(token);
    expect(state.ownerUserId).toBe("user_1");
    expect(state.provider).toBe("mendeley");
    expect(state.exp).toBeGreaterThan(Date.now());
  });

  test("tanda tangan diutak-atik → verify gagal", () => {
    const token = signOAuthState({ ownerUserId: "user_1", provider: "mendeley" });
    const [body] = token.split(".");
    expect(() => verifyOAuthState(`${body}.forgedsignature`)).toThrow();
  });

  test("body diganti tanpa re-sign → verify gagal (mengunci payload)", () => {
    const forgedBody = Buffer.from(
      JSON.stringify({ ownerUserId: "attacker", provider: "mendeley", nonce: "n", exp: Date.now() + 1000 }),
    ).toString("base64url");
    const realSig = signOAuthState({ ownerUserId: "user_1", provider: "mendeley" }).split(".")[1];
    // Body attacker + sig milik body lain → HMAC mismatch → ditolak.
    expect(() => verifyOAuthState(`${forgedBody}.${realSig}`)).toThrow();
  });
});
