import { ArtifactRepo, type Db, type DbOrTx, throwAppError } from "@aqsha/db";
import { BillingService } from "./billing.service";
import type { EntitlementResult } from "./billing/types";

/**
 * DocAiService — helper MURNI (TANPA import `ai`) untuk route AI native BlockNote (`apps/api`
 * `/blocknote-ai/chat`). xl-ai/server (ai@6) sengaja DIKURUNG di route api; services tetap bebas
 * `ai` supaya tak bentrok dengan agent (ai@7-beta). Di sini hidup: prompt Bahasa/brand, gerbang
 * ownership artifact, dan billing (precheck + debit idempotent rate Lite, event `doc_ai_edit`).
 *
 * Lihat docs/blocknote-native-ai-astra-implementation-plan.md §1 (D7/D9) + §3.2/§5.
 */

/** Provider billing untuk event `doc_ai_edit` (gateway OpenAI-compatible yang sama dengan Astra). */
const DOC_AI_PROVIDER = "openai";

/**
 * Preamble Bahasa Indonesia + brand voice yang DI-PREPEND ke `aiDocumentFormats.html.systemPrompt`
 * xl-ai di route. Sengaja singkat + tak menyentuh protokol operasi blok (yang diatur systemPrompt
 * format html). Brand voice: lihat `BRAND-IDENTITY.md` (jelas, ringan, tak mengklaim AI tanpa galat).
 */
export const INDO_BRAND_PROMPT = [
  "Kamu adalah Astra, asisten menulis untuk produk riset Aqsha, yang membantu pengguna menyunting dokumen mereka.",
  "Selalu tulis dan balas dalam Bahasa Indonesia yang jelas dan ringan — kecuali pengguna jelas memintamu memakai bahasa lain, atau bagian yang disunting memang berbahasa lain (mis. kutipan, istilah teknis, atau kode).",
  "Bantu agar tulisan akademik terasa lebih ringan dan jernih; utamakan kejelasan, bukan nada menakut-nakuti atau jargon produktivitas generik.",
  "Pertahankan makna, gaya, dan terminologi penulis; jangan mengarang fakta atau sitasi baru.",
  "Patuhi format operasi blok di instruksi berikut — keluarkan hanya operasi penyuntingan dokumen, jangan tambahkan komentar di luar dokumen.",
].join(" ");

export const DocAiService = {
  /**
   * Gerbang ownership + kelayakan: artifact harus ada, milik pemanggil, aktif, dan bertipe
   * `markdown` (satu-satunya tipe yang dirender di editor BlockNote). Selain itu → throw structured
   * `appError` (404/422) yang dipetakan route ke respons error.
   */
  async assertEditableArtifact(db: DbOrTx, ownerUserId: string, artifactId: string): Promise<void> {
    const artifact = await ArtifactRepo.findById(db, artifactId);
    if (!artifact || artifact.ownerUserId !== ownerUserId || artifact.status !== "active") {
      throwAppError({
        message: "Artifact tidak ditemukan atau bukan milik Anda.",
        code: "artifact_not_found",
        severity: "warning",
        status: 404,
      });
    }
    if (artifact.artifactType !== "markdown") {
      throwAppError({
        message: "Penyuntingan AI hanya berlaku untuk dokumen.",
        code: "artifact_not_editable_markdown",
        severity: "warning",
        status: 422,
      });
    }
  },

  /**
   * Precheck non-consuming sebelum stream (gate plan + sisa kuota). Return-union: `ok:false` saat
   * block (kuota habis / plan kurang) — route membalasnya sebagai structured error tanpa memanggil
   * model. `credits: 1` = minimal satu kredit tersedia (debit nyata token-based di `debitEdit`).
   */
  async precheckEdit(
    db: DbOrTx,
    args: { ownerUserId: string; ownerEmail?: string | null },
  ): Promise<EntitlementResult> {
    return BillingService.requireEntitlement(db, {
      ownerUserId: args.ownerUserId,
      ownerEmail: args.ownerEmail,
      feature: "doc_ai_edit",
      credits: 1,
    });
  },

  /**
   * Debit setelah stream sukses (`onFinish`) pada rate Lite berbasis token aktual. Idempotent via
   * `idempotencyKey` (di-derive route dari requestId) → onFinish ganda / retry tak double-debit.
   */
  async debitEdit(
    db: Db,
    args: {
      ownerUserId: string;
      ownerEmail?: string | null;
      artifactId: string;
      idempotencyKey: string;
      model?: string;
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    },
  ): Promise<EntitlementResult> {
    return BillingService.consumeCredits(db, {
      ownerUserId: args.ownerUserId,
      ownerEmail: args.ownerEmail,
      feature: "doc_ai_edit",
      provider: DOC_AI_PROVIDER,
      model: args.model,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      totalTokens: args.totalTokens,
      agentKind: "lite",
      idempotencyKey: args.idempotencyKey,
      metadataJson: JSON.stringify({ kind: "doc_ai_edit", artifactId: args.artifactId }),
    });
  },
};
