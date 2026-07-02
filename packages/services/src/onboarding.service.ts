import { OnboardingRepo, throwAppError } from "@aqsha/db";
import type { Db, DbOrTx } from "@aqsha/db";
import { isInterestFieldId, topicsForInterestFields } from "./feed/interestKeywords";
import { InterestService } from "./interest.service";
import {
  isBackgroundId,
  isSourceId,
  MIN_INTERESTS,
  SEED_INTEREST_WEIGHT,
  SOURCE_OTHER_ID,
} from "./onboarding/options";
import { type CurrentUserIdentity, ensureUserWithin } from "./user.service";

export type CompleteOnboardingInput = {
  background: string;
  interests: string[];
  heardAboutSource: string;
  heardAboutOther?: string;
};

export const OnboardingService = {
  /** Soft: tak butuh row users. Boolean(completedAt). */
  async getStatus(db: DbOrTx, ownerUserId: string): Promise<{ completed: boolean }> {
    const row = await OnboardingRepo.findByOwner(db, ownerUserId);
    return { completed: Boolean(row?.completedAt) };
  },

  /** Jawaban wizard yang bisa ditinjau/diubah dari Settings → Personalisasi (IMP-2). */
  async getProfile(
    db: DbOrTx,
    ownerUserId: string,
  ): Promise<{ background: string | null; interests: string[] }> {
    const row = await OnboardingRepo.findByOwner(db, ownerUserId);
    return { background: row?.background ?? null, interests: row?.interests ?? [] };
  },

  /**
   * Patch interests dari Settings (IMP-2) — validasi sama dengan `complete` (dedup-filter, min
   * MIN_INTERESTS), wajib onboarding sudah selesai (page settings hidup di balik gate /app).
   * Seed feed interests raise-only ikut di-refresh supaya personalisasi feed mengikuti.
   */
  async updateInterests(db: Db, ownerUserId: string, rawInterests: string[]): Promise<{ ok: true }> {
    const interests = [...new Set(rawInterests)].filter(isInterestFieldId);
    if (interests.length < MIN_INTERESTS) {
      throwAppError({
        code: "interests_too_few",
        message: `Pilih minimal ${MIN_INTERESTS} bidang yang kamu minati.`,
        field: "interests",
      });
    }
    const row = await OnboardingRepo.findByOwner(db, ownerUserId);
    if (!row?.completedAt) {
      throwAppError({
        code: "onboarding_incomplete",
        message: "Selesaikan onboarding dulu sebelum mengubah minat riset.",
        field: "interests",
      });
    }
    await db.transaction(async (tx) => {
      await OnboardingRepo.setInterests(tx, ownerUserId, interests, Date.now());
      await InterestService.seedFeedInterests(
        tx,
        ownerUserId,
        topicsForInterestFields(interests),
        SEED_INTEREST_WEIGHT,
      );
    });
    return { ok: true };
  },

  /**
   * Validasi (dedup-filter-count interests, enum background/source, other wajib
   * bila "lainnya") lalu — dalam satu transaksi — self-heal user, upsert
   * onboarding (set completedAt), seed feed interests (weight 2, raise-only).
   * Port `complete` V1.
   */
  async complete(
    db: Db,
    identity: CurrentUserIdentity,
    input: CompleteOnboardingInput,
  ): Promise<{ ok: true }> {
    if (!isBackgroundId(input.background)) {
      throwAppError({
        code: "onboarding_background_invalid",
        message: "Pilih salah satu latar belakang dulu, ya.",
        field: "background",
      });
    }

    const interests = [...new Set(input.interests)].filter(isInterestFieldId);
    if (interests.length < MIN_INTERESTS) {
      throwAppError({
        code: "interests_too_few",
        message: `Pilih minimal ${MIN_INTERESTS} bidang yang kamu minati.`,
        field: "interests",
      });
    }

    if (!isSourceId(input.heardAboutSource)) {
      throwAppError({
        code: "source_invalid",
        message: "Pilih satu sumber dulu, ya.",
        field: "heardAboutSource",
      });
    }

    const heardAboutOther = input.heardAboutOther?.trim();
    if (input.heardAboutSource === SOURCE_OTHER_ID && !heardAboutOther) {
      throwAppError({
        code: "source_other_required",
        message: "Tulis dari mana kamu tahu Aqsha.",
        field: "heardAboutOther",
      });
    }

    const now = Date.now();
    await db.transaction(async (tx) => {
      await ensureUserWithin(tx, identity); // self-heal bila /sync belum landing
      await OnboardingRepo.upsert(tx, {
        ownerUserId: identity.ownerUserId,
        background: input.background,
        interests,
        heardAboutSource: input.heardAboutSource,
        heardAboutOther: heardAboutOther || null,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await InterestService.seedFeedInterests(
        tx,
        identity.ownerUserId,
        topicsForInterestFields(interests),
        SEED_INTEREST_WEIGHT,
      );
    });

    return { ok: true };
  },
};
