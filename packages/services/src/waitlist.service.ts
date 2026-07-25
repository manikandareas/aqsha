import {
  type DbOrTx,
  throwAppError,
  WaitlistRepo,
} from "@aqsha/db";
import type { WaitlistEmailSender } from "./clients/resend";
import {
  createWaitlistVerificationToken,
  hashWaitlistVerificationToken,
  normalizeWaitlistJoinInput,
  type WaitlistJoinInput,
  WAITLIST_TOKEN_TTL_MS,
} from "./waitlist/model";

export type WaitlistServiceConfig = {
  siteUrl: string;
  sendEmail: WaitlistEmailSender;
  now?: () => number;
  createToken?: () => string;
};

export type WaitlistVerificationConfig = {
  now?: () => number;
};

export type WaitlistJoinResult = {
  ok: true;
  action: "verification_sent" | "already_confirmed";
};

/** Domain waitlist — join (double opt-in) + verify token. */
export const WaitlistService = {
  async join(
    db: DbOrTx,
    input: WaitlistJoinInput,
    config: WaitlistServiceConfig,
  ): Promise<WaitlistJoinResult> {
    const normalized = normalizeWaitlistJoinInput(input);
    const now = config.now?.() ?? Date.now();
    const existing = await WaitlistRepo.findByEmail(db, normalized.email);

    if (existing?.status === "confirmed") {
      return { ok: true, action: "already_confirmed" };
    }

    const token = (config.createToken ?? createWaitlistVerificationToken)();
    const tokenHash = await hashWaitlistVerificationToken(token);
    const expiresAt = now + WAITLIST_TOKEN_TTL_MS;

    if (existing?.status === "pending") {
      await WaitlistRepo.updateVerification(db, existing.id, {
        verificationTokenHash: tokenHash,
        verificationExpiresAt: expiresAt,
        companyOrUniversity: normalized.companyOrUniversity ?? existing.companyOrUniversity,
        updatedAt: now,
      });
    } else {
      const inserted = await WaitlistRepo.insert(db, {
        id: crypto.randomUUID(),
        email: normalized.email,
        companyOrUniversity: normalized.companyOrUniversity,
        status: "pending",
        verificationTokenHash: tokenHash,
        verificationExpiresAt: expiresAt,
        verifiedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      if (!inserted) {
        // Race unique-email: re-read dan ikuti perilaku baris yang sudah ada.
        const raced = await WaitlistRepo.findByEmail(db, normalized.email);
        if (raced?.status === "confirmed") {
          return { ok: true, action: "already_confirmed" };
        }
        if (raced?.status === "pending") {
          await WaitlistRepo.updateVerification(db, raced.id, {
            verificationTokenHash: tokenHash,
            verificationExpiresAt: expiresAt,
            companyOrUniversity: normalized.companyOrUniversity ?? raced.companyOrUniversity,
            updatedAt: now,
          });
        } else {
          throwAppError({
            code: "waitlist_join_failed",
            message: "Pendaftaran waitlist gagal. Coba lagi.",
            severity: "error",
            status: 500,
          });
        }
      }
    }

    const site = config.siteUrl.replace(/\/$/, "");
    const verificationUrl = `${site}/waitlist/verify?token=${encodeURIComponent(token)}`;

    // Kegagalan kirim email meninggalkan baris pending agar submit ulang bisa retry.
    await config.sendEmail({
      to: normalized.email,
      verificationUrl,
      expiresAt,
    });

    return { ok: true, action: "verification_sent" };
  },

  async verify(
    db: DbOrTx,
    token: string,
    config?: WaitlistVerificationConfig,
  ): Promise<{ ok: true }> {
    const now = config?.now?.() ?? Date.now();
    const trimmed = token.trim();
    if (!trimmed) {
      throwAppError({
        code: "waitlist_token_invalid",
        message: "Tautan verifikasi tidak valid atau sudah kedaluwarsa.",
        severity: "error",
        status: 400,
      });
    }

    const tokenHash = await hashWaitlistVerificationToken(trimmed);
    const row = await WaitlistRepo.findPendingByTokenHash(db, tokenHash);
    if (!row || row.verificationExpiresAt == null || row.verificationExpiresAt < now) {
      throwAppError({
        code: "waitlist_token_invalid",
        message: "Tautan verifikasi tidak valid atau sudah kedaluwarsa.",
        severity: "error",
        status: 400,
      });
    }

    const confirmed = await WaitlistRepo.confirmPending(db, row.id, now);
    if (!confirmed) {
      throwAppError({
        code: "waitlist_token_invalid",
        message: "Tautan verifikasi tidak valid atau sudah kedaluwarsa.",
        severity: "error",
        status: 400,
      });
    }

    return { ok: true };
  },
};
