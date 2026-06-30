import { createOpenAI } from "@ai-sdk/openai";
import {
  aiDocumentFormats,
  injectDocumentStateMessages,
  toolDefinitionsToToolSet,
} from "@blocknote/xl-ai/server";
import { DocAiService, INDO_BRAND_PROMPT, resolveAstraGateway } from "@aqsha/services";
import { convertToModelMessages, type ModelMessage, streamText, type UIMessage } from "ai";
import { Elysia, t } from "elysia";
import { getDb } from "../clients/db";
import { logger } from "../lib/log";
import { authMacro } from "../plugins/auth";
import { rateLimitMacro } from "../plugins/rate-limit";

/**
 * Route AI native BlockNote (`@blocknote/xl-ai`) — TITIK COLOK Astra untuk penyuntingan dokumen.
 *
 * Editor (in-editor `/ai`/toolbar/menu) maupun panel Astra (`invokeAI`) POST UIMessage[] +
 * toolDefinitions ke sini lewat `DefaultChatTransport`. Route menjalankan `streamText` dengan
 * `model` = gateway OpenAI-compatible yang SAMA dengan Astra (`OPENAI_BASE_URL`/`AQSHA_LITE_MODEL`,
 * lihat `apps/agent/src/mastra/model.ts`) → satu-satunya titik di mana model Astra dicolok.
 *
 * ai@6 + `@blocknote/xl-ai/server` sengaja DIKURUNG di `apps/api` (lihat plan §5.1): services tetap
 * bebas `ai` supaya tak bentrok dengan agent (ai@7-beta). Auth Clerk + ownership + billing (rate
 * Lite, event `doc_ai_edit`, idempotent) hidup di route ini via `DocAiService` (helper murni).
 *
 * Dasar: docs/blocknote-native-ai-astra-implementation-plan.md §5; kontrak route =
 * blocknotejs.org/docs/features/ai/backend-integration (body `{ messages, toolDefinitions }`).
 */

/**
 * Gateway Astra dari ENV yang SAMA dengan agent (`resolveAstraGateway`, SSOT di `@aqsha/services`).
 * Tetap memanggil `createOpenAI` ai@6 LOKAL di sini (bukan impor objek model agent ai@7) → tanpa skew
 * tipe V4↔ai@6; hanya nilai env + default model id yang di-share supaya tak drift dengan `model.ts`.
 */
const gateway = resolveAstraGateway();
const astraGateway = createOpenAI({
  ...(gateway.baseURL ? { baseURL: gateway.baseURL } : {}),
  ...(gateway.apiKey ? { apiKey: gateway.apiKey } : {}),
});
const liteModelId = gateway.liteModelId;

/** Format dokumen default/stabil xl-ai = HTML (operasi blok add/update/delete). Storage artifact tak berubah. */
const htmlFormat = aiDocumentFormats.html;

export const blocknoteAi = new Elysia()
  .use(authMacro)
  .use(rateLimitMacro)
  .post(
    "/blocknote-ai/chat",
    async ({ ownerUserId, email, body, status }) => {
      const { db } = getDb();
      const { artifactId, messages, toolDefinitions } = body;

      // 1) Ownership + kelayakan (markdown, milik user, aktif). Throw appError → errorPlugin (404/422).
      await DocAiService.assertEditableArtifact(db, ownerUserId, artifactId);

      // 2) Billing gate non-consuming. Block (kuota/plan/langganan) → structured 402 (return-union,
      //    BUKAN throw). Petakan KETIGA reason EntitlementResult (termasuk `billing_inactive` =
      //    langganan lapse, beda dari `subscription_required` = plan kurang).
      const gate = await DocAiService.precheckEdit(db, { ownerUserId, ownerEmail: email });
      if (!gate.ok) {
        const blocked = {
          quota_exceeded: {
            code: "billing_quota_exceeded",
            message:
              "Kuota kredit bulanan Anda sudah habis. Tunggu reset atau tingkatkan paket untuk lanjut menyunting dengan AI.",
          },
          subscription_required: {
            code: "billing_subscription_required",
            message: "Paket Anda belum mendukung penyuntingan AI. Tingkatkan paket untuk mengaktifkannya.",
          },
          billing_inactive: {
            code: "billing_inactive",
            message:
              "Langganan Anda sedang tidak aktif. Perbarui pembayaran untuk melanjutkan penyuntingan AI.",
          },
        } as const;
        const picked = blocked[gate.reason];
        return status(402, { message: picked.message, code: picked.code, severity: "warning" as const });
      }

      // 3) streamText → model Astra. `requestId` baru per-request: idempotencyKey-nya men-dedupe
      //    re-entry onFinish DALAM request ini (satu streamText = satu onFinish), BUKAN retry
      //    klien lintas-request (tiap retry = panggilan model baru = debit baru, memang berbeda).
      const requestId = crypto.randomUUID();
      const result = streamText({
        model: astraGateway.chat(liteModelId),
        system: `${INDO_BRAND_PROMPT}\n\n${htmlFormat.systemPrompt}`,
        messages: (await convertToModelMessages(
          injectDocumentStateMessages(messages as UIMessage[]),
        )) as ModelMessage[],
        tools: toolDefinitionsToToolSet(
          (toolDefinitions ?? {}) as Parameters<typeof toolDefinitionsToToolSet>[0],
        ),
        toolChoice: "required",
        onFinish: async ({ usage }) => {
          // 4) Debit idempotent rate Lite setelah stream sukses. Kegagalan debit tak boleh
          //    merusak respons yang sudah ter-stream → tangkap + log (observability di route).
          try {
            const debit = await DocAiService.debitEdit(db, {
              ownerUserId,
              ownerEmail: email,
              artifactId,
              idempotencyKey: `doc_ai_edit:${requestId}`,
              model: liteModelId,
              inputTokens: usage?.inputTokens,
              outputTokens: usage?.outputTokens,
              totalTokens: usage?.totalTokens,
            });
            // Precheck cuma jamin 1 kredit; biaya nyata token-based bisa MELEBIHI sisa → consumeCredits
            // mem-block & TAK menulis ledger (edit sudah ter-stream = tak ter-charge). Belum bisa
            // di-rollback pasca-stream, tapi WAJIB terlihat agar bocor kuota terukur (bukan senyap).
            if (!debit.ok) {
              logger.warn(
                { ownerUserId, artifactId, requestId, reason: debit.reason },
                "doc_ai_edit_debit_blocked",
              );
            }
          } catch (err) {
            logger.error({ err, ownerUserId, artifactId, requestId }, "doc_ai_edit_debit_failed");
          }
        },
      });

      return result.toUIMessageStreamResponse();
    },
    {
      auth: true,
      rateLimit: "chat:send",
      body: t.Object({
        artifactId: t.String(),
        messages: t.Array(t.Any()),
        toolDefinitions: t.Optional(t.Any()),
      }),
    },
  );
