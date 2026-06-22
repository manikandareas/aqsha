"use client";

import { ShieldCheckIcon } from "@aqsha/ui/icons";
import { cn } from "@/lib/utils";
import type { VerdictStatus, VerificationCardModel } from "../lib/eve-timeline";

/** Label + tone per status verdict (Slice 7.2). Netral — flag bukan tuduhan. */
const STATUS_META: Record<VerdictStatus, { label: string; tone: string }> = {
  verified: { label: "Terverifikasi", tone: "text-emerald-600 dark:text-emerald-400" },
  metadata_mismatch: { label: "Metadata tak cocok", tone: "text-amber-600 dark:text-amber-400" },
  identifier_invalid: { label: "Identifier tak valid", tone: "text-red-600 dark:text-red-400" },
  not_found: { label: "Tak ditemukan", tone: "text-red-600 dark:text-red-400" },
  unverifiable: { label: "Tak dapat diverifikasi", tone: "text-muted-foreground" },
};

/**
 * Kartu verifikasi sitasi (Slice 7.2) — tabel ringkas verdict per-`[n]` dari output
 * `verify_identifiers`/`verify_citations` yang muncul di timeline (live). Tampil saat
 * root menjalankan verifikasi; verdict subagent `citation-verifier` dikonsolidasi root
 * ke jawaban akhir (output subagent ada di child stream — lihat catatan FLAG-2).
 */
export function VerificationCard({ model }: { model: VerificationCardModel }) {
  if (model.items.length === 0) {
    return (
      <div className="rounded-[10px] border border-border/80 bg-card/40 px-3 py-2 text-[12px] text-muted-foreground">
        Verifikasi sitasi: {model.note ?? "tidak ada referensi yang dapat diperiksa."}
      </div>
    );
  }
  return (
    <div className="flex w-full min-w-0 flex-col rounded-[10px] border border-border/80 bg-card/40 px-3 py-2.5 text-[12px]">
      <div className="flex items-center gap-1.5 font-medium text-foreground">
        <ShieldCheckIcon className="size-3.5 text-muted-foreground" />
        Verifikasi sitasi
        <span className="font-normal text-muted-foreground">
          · {model.checked} diperiksa, {model.verified} terverifikasi
          {model.flagged > 0 ? `, ${model.flagged} ditandai` : ""}
        </span>
      </div>
      <ul className="mt-2 grid gap-1.5">
        {model.items.map((item, i) => {
          const meta = STATUS_META[item.status];
          return (
            <li key={item.citation ?? `${item.reference}:${i}`} className="flex min-w-0 gap-2">
              <span className="shrink-0 font-medium text-muted-foreground tabular-nums">
                {item.citation !== undefined ? `[${item.citation}]` : "—"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 break-words text-foreground/90">{item.reference}</span>
                <span className={cn("mt-0.5 block font-medium", meta.tone)}>
                  {meta.label}
                  {item.issues.length > 0 ? (
                    <span className="font-normal text-muted-foreground"> · {item.issues.join("; ")}</span>
                  ) : null}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
