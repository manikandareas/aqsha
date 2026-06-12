import { createTool } from "@convex-dev/agent";
import type { ToolSet } from "ai";
import { z } from "zod";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
  type AgentToolCtx,
  isLikelyConvexId,
  requireToolThread,
  requireToolUser,
} from "../tools/toolContext";
import { resolveArtifactPlainText } from "./artifactText";
import {
  COMPUTATION_TASK_KINDS,
  routeComputationTaskKind,
  type ComputationTaskKind,
} from "./computationRouting";
import type {
  MetaAnalysisRunResult,
  StatVerificationResult,
} from "./sandboxRunner";

// Tool names exposed by the sandbox compute path. Used by messages.ts to add
// the tools to `activeTools` when the compute router exposes them (mirrors
// NORMAL_CHAT_TOOL_NAMES / HITL_INITIAL_TOOL_NAMES). verifyStatistics is
// auto-execute (read-only); runComputation is approval-gated.
export const SANDBOX_TOOL_NAMES = ["verifyStatistics", "runComputation"] as const;

// statcheck only parses APA-style NHST reporting (best in psychology; sparse in
// table-only biomed/econ). This honesty line is surfaced when nothing was
// checkable so coverage is never overstated.
const COVERAGE_NOTE =
  "statcheck hanya memeriksa pelaporan uji NHST gaya APA (mis. t, F, r, χ², z) — paling cocok untuk psikologi/sosial dan terbatas untuk statistik berbasis tabel.";

// Discrepancy is NOT fraud. This framing is product-critical (see plan).
const NEUTRAL_FRAMING =
  "Catatan: ketidakcocokan angka bukan indikasi kecurangan — bisa berasal dari pembulatan, salah ketik, koreksi, uji satu-arah, atau artefak ekstraksi teks. Setiap hasil dapat diputar ulang.";

const VERDICT_LABEL: Record<string, string> = {
  passed: "lolos",
  passed_with_notes: "lolos dengan catatan",
  needs_review: "perlu ditinjau",
  failed: "gagal dijalankan",
};

function neutralMessage(result: StatVerificationResult): string {
  switch (result.status) {
    case "not_configured":
      return "Mesin verifikasi statistik belum aktif di lingkungan ini, jadi pengecekan tidak dapat dijalankan saat ini.";
    case "rate_limited":
      return "Terlalu banyak permintaan verifikasi statistik dalam waktu singkat. Coba lagi sebentar lagi.";
    case "quota_blocked":
      return result.reason === "subscription_required"
        ? "Verifikasi statistik tersedia di paket berbayar (Astra Pro). Tingkatkan paket untuk menggunakannya."
        : "Kuota kredit untuk verifikasi statistik sudah habis untuk periode ini.";
    case "failed":
      return "Verifikasi statistik gagal dijalankan. Tidak ada hasil yang dapat dilaporkan untuk percobaan ini.";
    case "completed": {
      const s = result.summary;
      if (s.checked === 0) {
        return `Tidak ada nilai statistik yang dapat diperiksa pada dokumen ini. ${COVERAGE_NOTE}`;
      }
      const k = result.byKind;
      const parts = [
        `Hasil verifikasi: ${VERDICT_LABEL[result.verdict] ?? result.verdict}.`,
        `Memeriksa ${s.checked} nilai (statcheck ${k.statcheck.checked}, GRIM/GRIMMER ${k.grim.checked + k.grimmer.checked}, power ${k.power.checked}).`,
        `${s.consistent} konsisten`,
        `${s.discrepant} tidak rekonsiliasi`,
        `${s.decisionErrors} perbedaan keputusan signifikansi`,
      ];
      if (s.notComputable > 0) {
        parts.push(`${s.notComputable} tidak dapat dihitung ulang`);
      }
      return `${parts.join(", ")}. ${NEUTRAL_FRAMING} ${COVERAGE_NOTE}`;
    }
  }
}

// Compact, neutral view of the notable checks for the model to cite — capped so
// a paper with many flags does not flood the context.
function notableFindings(result: StatVerificationResult) {
  if (result.status !== "completed") return [];
  return result.items.slice(0, 25).map((item) => ({
    kind: item.checkKind,
    outcome: item.outcome,
    claim: item.claimText,
    detail: item.detail,
  }));
}

// Shared statcheck/GRIM/power run over a workspace artifact: resolve full text,
// delegate to the sandbox runner, and shape a neutral response. Used by both the
// auto verifyStatistics tool and the approved stat_verification path of
// runComputation.
async function runVerificationForArtifact(
  ctx: AgentToolCtx,
  args: { runId?: Id<"agentRuns">; artifactIdInput: string },
) {
  const ownerUserId = requireToolUser(ctx);
  const threadId = requireToolThread(ctx);
  if (!isLikelyConvexId(args.artifactIdInput)) {
    return {
      status: "no_paper" as const,
      message:
        "Tidak ada dokumen yang valid untuk diverifikasi. Minta pengguna memilih atau melampirkan paper terlebih dahulu.",
    };
  }
  const artifactId = args.artifactIdInput as Id<"artifacts">;
  const text = await resolveArtifactPlainText(ctx, ownerUserId, artifactId);
  if (!text.trim()) {
    return {
      status: "no_text" as const,
      message:
        "Teks dokumen belum dapat dibaca (mungkin masih diindeks atau tidak berisi teks). Verifikasi statistik tidak dapat dijalankan.",
    };
  }

  const result: StatVerificationResult = await ctx.runAction(
    internal.agent.sandbox.sandboxRunner.runStatVerification,
    { ownerUserId, threadId, runId: args.runId, artifactId, text },
  );

  return {
    status: result.status,
    verdict: result.status === "completed" ? result.verdict : undefined,
    sandboxRunId:
      result.status === "completed" || result.status === "failed"
        ? result.sandboxRunId
        : undefined,
    summary: result.status === "completed" ? result.summary : undefined,
    findings: notableFindings(result),
    message: neutralMessage(result),
  };
}

// Neutral, task-specific message for a meta-analysis run. Heterogeneity is
// described, never treated as an error; publication-bias diagnostics are framed
// as cautionary signals, not proof.
function neutralMetaMessage(result: MetaAnalysisRunResult): string {
  switch (result.status) {
    case "not_configured":
      return "Mesin komputasi belum aktif di lingkungan ini, jadi meta-analisis tidak dapat dijalankan saat ini.";
    case "rate_limited":
      return "Terlalu banyak permintaan komputasi dalam waktu singkat. Coba lagi sebentar lagi.";
    case "quota_blocked":
      return result.reason === "subscription_required"
        ? "Meta-analisis tersedia di paket berbayar (Astra Pro). Tingkatkan paket untuk menggunakannya."
        : "Kuota kredit untuk komputasi sudah habis untuk periode ini.";
    case "failed":
      return "Meta-analisis gagal dijalankan. Tidak ada hasil yang dapat dilaporkan untuk percobaan ini.";
    case "completed": {
      const s = result.summary;
      if (s.status !== "ok") {
        return s.status === "insufficient_studies" || s.status === "no_studies"
          ? `Tidak cukup studi dengan data efek yang dapat digabungkan (k=${s.k}). Meta-analisis membutuhkan minimal dua studi dengan effect size + varians, atau mean/SD/N per kelompok.`
          : "Model meta-analisis tidak dapat diestimasi dari data yang tersedia.";
      }
      const parts = [
        `Meta-analisis ${s.k} studi (${s.measure}).`,
        `Estimasi gabungan ${s.pooledEstimate.toFixed(3)} (95% CI ${s.ciLower.toFixed(3)}–${s.ciUpper.toFixed(3)}, p=${s.pValue.toFixed(3)}).`,
        `Heterogenitas ${result.heterogeneity} (I²=${s.i2.toFixed(0)}%, Q p=${s.qPValue.toFixed(3)}).`,
      ];
      if (s.eggerPValue != null) {
        parts.push(`Uji Egger p=${s.eggerPValue.toFixed(3)}.`);
      }
      if (result.publicationBiasSignal) {
        parts.push(
          "Ada sinyal kemungkinan bias publikasi — perlu ditafsirkan hati-hati, bukan bukti pasti.",
        );
      }
      return parts.join(" ");
    }
  }
}

// Resolve full text for an artifact and run the approved meta-analysis via the
// dispatcher, shaping a neutral response. Mirrors runVerificationForArtifact.
async function runMetaAnalysisForArtifact(
  ctx: AgentToolCtx,
  args: { runId?: Id<"agentRuns">; artifactIdInput: string },
) {
  const ownerUserId = requireToolUser(ctx);
  const threadId = requireToolThread(ctx);
  if (!isLikelyConvexId(args.artifactIdInput)) {
    return {
      status: "no_paper" as const,
      message:
        "Tidak ada dokumen yang valid untuk dianalisis. Minta pengguna memilih atau melampirkan paper terlebih dahulu.",
    };
  }
  const artifactId = args.artifactIdInput as Id<"artifacts">;
  const text = await resolveArtifactPlainText(ctx, ownerUserId, artifactId);
  if (!text.trim()) {
    return {
      status: "no_text" as const,
      message:
        "Teks dokumen belum dapat dibaca (mungkin masih diindeks atau tidak berisi teks). Meta-analisis tidak dapat dijalankan.",
    };
  }

  const dispatched = await ctx.runAction(
    internal.agent.sandbox.sandboxRunner.runComputation,
    { ownerUserId, threadId, runId: args.runId, artifactId, text, taskKind: "meta_analysis" },
  );
  const result: MetaAnalysisRunResult = dispatched as MetaAnalysisRunResult;

  return {
    status: result.status,
    sandboxRunId:
      result.status === "completed" || result.status === "failed"
        ? result.sandboxRunId
        : undefined,
    summary: result.status === "completed" ? result.summary : undefined,
    message: neutralMetaMessage(result),
  };
}

export function buildSandboxTools(args: { runId?: Id<"agentRuns"> }): ToolSet {
  return {
    verifyStatistics: createTool({
      description:
        "Recompute and check the statistical consistency of a paper's reported NHST results (statcheck: recomputes p-values from the reported test statistic + degrees of freedom). Use when the user asks to verify, recompute, or check the statistics / p-values / significance of a specific workspace document. Read-only over the paper, runs in a sandbox. Report results in neutral language: a numeric discrepancy is NOT fraud. Always mention coverage limits and that results are replayable.",
      inputSchema: z.object({
        artifactId: z
          .string()
          .describe(
            "The id of the workspace document (paper) to verify. Use the artifact referenced in the conversation or attached to the message.",
          ),
      }),
      execute: async (ctx: AgentToolCtx, input: { artifactId: string }) =>
        runVerificationForArtifact(ctx, {
          runId: args.runId,
          artifactIdInput: input.artifactId,
        }),
    }),

    runComputation: createTool({
      description:
        "Run an approval-gated statistical computation over a workspace document. The user must approve before it runs — populate title, summary, and planBullets as an informed-consent card stating the document, what will run, and that it costs sandbox credits. taskKind 'stat_verification' recomputes statistics (statcheck/GRIM/power); 'meta_analysis' pools per-study effect sizes reported in the document into a random-effects estimate with heterogeneity (I²/Q) and publication-bias diagnostics (Egger, trim-and-fill) plus forest/funnel plots; 'replication' and 'custom_analysis' are not yet available at this tier (they need sandbox network access). Report results in neutral language.",
      inputSchema: z.object({
        artifactId: z
          .string()
          .describe("The id of the workspace document to run the computation over."),
        taskKind: z
          .enum(COMPUTATION_TASK_KINDS)
          .describe("The kind of computation to run."),
        title: z.string().min(1).max(160).describe("Short approval-card title."),
        summary: z
          .string()
          .min(1)
          .max(1000)
          .describe("What will run, on which document, and the credit cost."),
        planBullets: z
          .array(z.string().max(240))
          .min(1)
          .max(8)
          .describe("Concrete steps shown on the approval card (command, files, ~credit cost)."),
      }),
      needsApproval: true,
      execute: async (
        ctx: AgentToolCtx,
        input: { artifactId: string; taskKind: ComputationTaskKind },
      ) => {
        if (routeComputationTaskKind(input.taskKind) === "tier_unavailable") {
          return {
            status: "tier_unavailable" as const,
            message:
              "Komputasi ini (replikasi/analisis kustom) belum tersedia pada tier saat ini karena memerlukan akses jaringan sandbox. Verifikasi statistik (stat_verification) dan meta-analisis (meta_analysis) tetap bisa dijalankan.",
          };
        }
        if (input.taskKind === "meta_analysis") {
          return runMetaAnalysisForArtifact(ctx, {
            runId: args.runId,
            artifactIdInput: input.artifactId,
          });
        }
        return runVerificationForArtifact(ctx, {
          runId: args.runId,
          artifactIdInput: input.artifactId,
        });
      },
    }),
  };
}
