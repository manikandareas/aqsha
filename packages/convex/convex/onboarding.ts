import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureCurrentUser } from "./auth/userRepository";
import { seedFeedInterests } from "./feed/interests";
import {
  isInterestFieldId,
  topicsForInterestFields,
} from "./feed/interestKeywords";
import { throwAppError } from "./lib/appError";

// ── Canonical option sets ────────────────────────────────────────────────────
// These ids are the contract with the frontend (apps/web/features/onboarding/
// lib/onboarding-options.ts). Labels live on the frontend; the backend only
// validates ids and maps interest fields → feed topics.

const BACKGROUND_IDS = [
  "pelajar",
  "mahasiswa_s1",
  "mahasiswa_s2",
  "mahasiswa_s3",
  "peneliti",
  "dosen",
  "profesional",
  "lainnya",
] as const;

const SOURCE_IDS = [
  "teman",
  "instagram",
  "tiktok",
  "x",
  "youtube",
  "google",
  "linkedin",
  "kampus",
  "lainnya",
] as const;

// The interest field id → topic taxonomy lives in feed/interestKeywords.ts (the
// single source of truth, shared with the feed's interest scoring + search
// recommendations). Onboarding only validates the picked ids and seeds the
// resulting topics.

const MIN_INTERESTS = 3;
const SEED_INTEREST_WEIGHT = 2;

const backgroundSet = new Set<string>(BACKGROUND_IDS);
const sourceSet = new Set<string>(SOURCE_IDS);

// ── Read: has the current user finished onboarding? ──────────────────────────
// Soft lookup keyed on identity.tokenIdentifier (same owner key the feed tables
// use). Deliberately does NOT require a synced users row, so the client gate
// can call this immediately after sign-in without racing the user-sync mutation.
export const getStatus = query({
  args: {},
  returns: v.object({ completed: v.boolean() }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { completed: false };
    const row = await ctx.db
      .query("userOnboarding")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", identity.tokenIdentifier))
      .unique();
    return { completed: Boolean(row?.completedAt) };
  },
});

// ── Write: persist onboarding answers + seed feed personalization ────────────
export const complete = mutation({
  args: {
    background: v.string(),
    interests: v.array(v.string()),
    heardAboutSource: v.string(),
    heardAboutOther: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    // Self-heal: create the users row if the client sync hasn't landed yet.
    const user = await ensureCurrentUser(ctx);

    if (!backgroundSet.has(args.background)) {
      throwAppError({
        code: "onboarding_background_invalid",
        message: "Pilih salah satu latar belakang dulu, ya.",
        field: "background",
      });
    }

    const interests = [...new Set(args.interests)].filter((id) =>
      isInterestFieldId(id),
    );
    if (interests.length < MIN_INTERESTS) {
      throwAppError({
        code: "onboarding_interests_too_few",
        message: `Pilih minimal ${MIN_INTERESTS} bidang yang kamu minati.`,
        field: "interests",
      });
    }

    if (!sourceSet.has(args.heardAboutSource)) {
      throwAppError({
        code: "onboarding_source_invalid",
        message: "Pilih satu sumber dulu, ya.",
        field: "heardAboutSource",
      });
    }

    const heardAboutOther = args.heardAboutOther?.trim();
    if (args.heardAboutSource === "lainnya" && !heardAboutOther) {
      throwAppError({
        code: "onboarding_source_other_required",
        message: "Tulis dari mana kamu tahu Aqsha.",
        field: "heardAboutOther",
      });
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("userOnboarding")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", user._id))
      .unique();

    const record = {
      background: args.background,
      interests,
      heardAboutSource: args.heardAboutSource,
      heardAboutOther: heardAboutOther || undefined,
      completedAt: now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch("userOnboarding", existing._id, record);
    } else {
      await ctx.db.insert("userOnboarding", {
        ownerUserId: user._id,
        createdAt: now,
        ...record,
      });
    }

    // Translate picked fields into feed signal so /app/explore is personalized
    // the moment the user lands there.
    const topics = topicsForInterestFields(interests);
    await seedFeedInterests(ctx, user._id, topics, SEED_INTEREST_WEIGHT);

    return { ok: true };
  },
});
