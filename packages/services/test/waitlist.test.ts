import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AppError, createDb, runMigrations, WaitlistRepo } from "@aqsha/db";
import {
  renderedVerificationEmail,
  type WaitlistEmailSender,
} from "../src/clients/resend";
import { WaitlistService } from "../src/waitlist.service";
import {
  createWaitlistVerificationToken,
  hashWaitlistVerificationToken,
  normalizeWaitlistEmail,
  normalizeWaitlistJoinInput,
  WAITLIST_COMPANY_MAX_CHARS,
} from "../src/waitlist/model";

describe("waitlist model helpers", () => {
  test("normalizes waitlist email", () => {
    expect(normalizeWaitlistEmail("  User@Example.COM ")).toBe("user@example.com");
  });

  test("rejects empty and invalid email", () => {
    expect(() => normalizeWaitlistJoinInput({ email: "   " })).toThrow(AppError);
    try {
      normalizeWaitlistJoinInput({ email: "   " });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe("waitlist_email_required");
    }
    try {
      normalizeWaitlistJoinInput({ email: "not-an-email" });
    } catch (error) {
      expect((error as AppError).code).toBe("waitlist_email_invalid");
    }
  });

  test("optional company trimmed; rejects over max length", () => {
    expect(normalizeWaitlistJoinInput({ email: "a@b.co", companyOrUniversity: "  ITB  " }))
      .toEqual({ email: "a@b.co", companyOrUniversity: "ITB" });
    expect(normalizeWaitlistJoinInput({ email: "a@b.co", companyOrUniversity: "   " }))
      .toEqual({ email: "a@b.co", companyOrUniversity: null });
    try {
      normalizeWaitlistJoinInput({
        email: "a@b.co",
        companyOrUniversity: "x".repeat(WAITLIST_COMPANY_MAX_CHARS + 1),
      });
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).code).toBe("waitlist_company_too_long");
    }
  });

  test("creates a token whose hash is stable but whose value is not plaintext", async () => {
    const token = createWaitlistVerificationToken();
    expect(token.length).toBeGreaterThan(40);
    expect(await hashWaitlistVerificationToken(token)).not.toContain(token);
    expect(await hashWaitlistVerificationToken(token)).toBe(await hashWaitlistVerificationToken(token));
    expect(createWaitlistVerificationToken()).not.toBe(token);
  });

  test("renders verification email with branding and expiry", () => {
    const html = renderedVerificationEmail("https://aqshara.com/waitlist/verify?token=abc", Date.now());
    expect(html).toContain("Aqsha");
    expect(html).toContain("https://aqshara.com/waitlist/verify?token=abc");
    expect(html).toContain("notifikasi peluncuran");
  });
});

const DATABASE_URL = process.env.DATABASE_URL;
const dbTest = DATABASE_URL ? test : test.skip;
const emailA = `wl_svc_${Math.floor(Math.random() * 1e9)}@example.com`;
const emailB = `wl_svc_b_${Math.floor(Math.random() * 1e9)}@example.com`;
const emailC = `wl_svc_c_${Math.floor(Math.random() * 1e9)}@example.com`;
const emailFail = `wl_svc_fail_${Math.floor(Math.random() * 1e9)}@example.com`;

beforeAll(async () => {
  if (DATABASE_URL) await runMigrations(DATABASE_URL);
});

afterAll(async () => {
  if (!DATABASE_URL) return;
  const { client } = createDb(DATABASE_URL);
  await client`delete from waitlist_entries where email in (${emailA}, ${emailB}, ${emailC}, ${emailFail})`;
  await client.end();
});

describe("WaitlistService integration", () => {
  dbTest("new pending row and one email sent", async () => {
    const { db, client } = createDb(DATABASE_URL!);
    const sent: Array<{ to: string; verificationUrl: string; expiresAt: number }> = [];
    const sendEmail: WaitlistEmailSender = async (input) => {
      sent.push(input);
    };

    const result = await WaitlistService.join(
      db,
      { email: emailA, companyOrUniversity: "UI" },
      { siteUrl: "https://aqshara.com/", sendEmail },
    );
    expect(result).toEqual({ ok: true, action: "verification_sent" });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(emailA);
    expect(sent[0]!.verificationUrl).toContain("/waitlist/verify?token=");

    const row = await WaitlistRepo.findByEmail(db, emailA);
    expect(row?.status).toBe("pending");
    expect(row?.companyOrUniversity).toBe("UI");
    const token = new URL(sent[0]!.verificationUrl).searchParams.get("token")!;
    expect(row?.verificationTokenHash).toBe(await hashWaitlistVerificationToken(token));
    expect(row?.verificationTokenHash).not.toBe(token);
    await client.end();
  });

  dbTest("existing pending row gets a replacement token and one email sent", async () => {
    const { db, client } = createDb(DATABASE_URL!);
    const sent: Array<{ to: string; verificationUrl: string }> = [];
    const sendEmail: WaitlistEmailSender = async (input) => {
      sent.push(input);
    };

    await WaitlistService.join(db, { email: emailB }, { siteUrl: "https://aqshara.com", sendEmail });
    const firstHash = (await WaitlistRepo.findByEmail(db, emailB))!.verificationTokenHash;
    await WaitlistService.join(db, { email: emailB }, { siteUrl: "https://aqshara.com", sendEmail });
    const secondHash = (await WaitlistRepo.findByEmail(db, emailB))!.verificationTokenHash;

    expect(sent).toHaveLength(2);
    expect(secondHash).not.toBe(firstHash);
    expect((await WaitlistRepo.findByEmail(db, emailB))?.status).toBe("pending");
    await client.end();
  });

  dbTest("existing confirmed row sends no email", async () => {
    const { db, client } = createDb(DATABASE_URL!);
    const sent: unknown[] = [];
    const sendEmail: WaitlistEmailSender = async (input) => {
      sent.push(input);
    };

    await WaitlistService.join(db, { email: emailC }, { siteUrl: "https://aqshara.com", sendEmail });
    const token = new URL((sent[0] as { verificationUrl: string }).verificationUrl).searchParams.get(
      "token",
    )!;
    await WaitlistService.verify(db, token);
    sent.length = 0;

    const result = await WaitlistService.join(
      db,
      { email: emailC },
      { siteUrl: "https://aqshara.com", sendEmail },
    );
    expect(result).toEqual({ ok: true, action: "already_confirmed" });
    expect(sent).toHaveLength(0);
    await client.end();
  });

  dbTest("valid token confirms and cannot be reused; expired/invalid rejected", async () => {
    const { db, client } = createDb(DATABASE_URL!);
    const sent: Array<{ verificationUrl: string }> = [];
    const email = `wl_verify_${Math.floor(Math.random() * 1e9)}@example.com`;
    const sendEmail: WaitlistEmailSender = async (input) => {
      sent.push(input);
    };

    await WaitlistService.join(db, { email }, { siteUrl: "https://aqshara.com", sendEmail });
    const token = new URL(sent[0]!.verificationUrl).searchParams.get("token")!;

    expect(await WaitlistService.verify(db, token)).toEqual({ ok: true });
    expect((await WaitlistRepo.findByEmail(db, email))?.status).toBe("confirmed");

    try {
      await WaitlistService.verify(db, token);
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).code).toBe("waitlist_token_invalid");
    }

    try {
      await WaitlistService.verify(db, "not-a-real-token");
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).code).toBe("waitlist_token_invalid");
    }

    // Expired: seed pending with past expiry then verify matching token.
    const expiredEmail = `wl_exp_${Math.floor(Math.random() * 1e9)}@example.com`;
    const expiredToken = createWaitlistVerificationToken();
    const expiredHash = await hashWaitlistVerificationToken(expiredToken);
    await WaitlistRepo.insert(db, {
      id: crypto.randomUUID(),
      email: expiredEmail,
      companyOrUniversity: null,
      status: "pending",
      verificationTokenHash: expiredHash,
      verificationExpiresAt: Date.now() - 1_000,
      verifiedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    try {
      await WaitlistService.verify(db, expiredToken, { now: () => Date.now() });
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).code).toBe("waitlist_token_invalid");
    }

    await client`delete from waitlist_entries where email in (${email}, ${expiredEmail})`;
    await client.end();
  });

  dbTest("sender failure leaves the row pending", async () => {
    const { db, client } = createDb(DATABASE_URL!);
    const sendEmail: WaitlistEmailSender = async () => {
      throw new AppError({
        code: "waitlist_email_send_failed",
        message: "Email verifikasi gagal dikirim. Coba lagi nanti.",
        severity: "error",
        status: 502,
      });
    };

    try {
      await WaitlistService.join(
        db,
        { email: emailFail },
        { siteUrl: "https://aqshara.com", sendEmail },
      );
      expect.unreachable();
    } catch (error) {
      expect((error as AppError).code).toBe("waitlist_email_send_failed");
    }
    expect((await WaitlistRepo.findByEmail(db, emailFail))?.status).toBe("pending");
    await client.end();
  });
});
