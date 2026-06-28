"use client";

// Zona "Masuk lebih dalam" kanan · Tension Map — tug-of-war. Satu bar terbagi:
// bobot Mendukung (mint, kiri) vs Membantah (coral, kanan); titik temu = kondisi bukti.
// Label "condong ke X" = insight utama, terbaca <1 detik. Di bawahnya klaim tiap sisi
// jadi baris ringkas (judul + bobot sitasi). Data NYATA dari /explore/analysis (LLM stance).

import { useMemo } from "react";
import { deriveTilt, leanColorVar, leanLabel, sumWeights } from "../lib/tension-math";
import type { TensionClaim, TensionData } from "../types";
import type { GapStatus } from "./gap-finder";

export function TensionMap({ status, tension }: { status: GapStatus; tension: TensionData | null }) {
  const stats = useMemo(() => {
    if (!tension) return null;
    const sW = sumWeights(tension.support);
    const dW = sumWeights(tension.dispute);
    const total = sW + dW;
    const supportPct = total > 0 ? Math.round((sW / total) * 100) : 50;
    const tilt = deriveTilt(sW, dW, 13);
    return { sW, dW, supportPct, disputePct: 100 - supportPct, tilt };
  }, [tension]);

  const header = (
    <div className="mb-2 flex items-center gap-2.5">
      <h3 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Tension Map</h3>
      {stats ? (
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          condong ke{" "}
          <span style={{ color: leanColorVar(stats.tilt) }}>{leanLabel(stats.tilt)}</span>
        </span>
      ) : null}
    </div>
  );

  if (status === "idle" || status === "loading" || status === "error" || !tension || !stats) {
    return (
      <div className="flex flex-col py-[30px] pr-0 @3xl/explore:pl-[38px]">
        {header}
        <div className="mt-4 flex min-h-[220px] flex-1 items-center justify-center px-6 text-center font-mono text-[11px] text-muted-foreground">
          {status === "loading" ? (
            <span className="inline-flex items-center gap-2.5">
              <span className="inline-block size-3 animate-spin rounded-full border-2 border-border border-t-primary" />
              Menimbang bukti yang mendukung vs membantah…
            </span>
          ) : status === "error" ? (
            "Gagal menganalisis topik ini."
          ) : status === "idle" ? (
            "Cari topik untuk melihat peta tensi bukti."
          ) : (
            "Tak ada tensi menonjol untuk topik ini."
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col py-[30px] pr-0 @3xl/explore:pl-[38px]">
      {header}
      <p className="mb-5 text-[12.5px] leading-relaxed text-muted-foreground">{tension.question}</p>

      {/* Tug-of-war — bobot bukti dukung vs bantah */}
      <div className="mb-1.5 flex items-baseline justify-between gap-3 font-mono text-[10.5px]">
        <span className="text-mint-foreground">Mendukung · {stats.supportPct}%</span>
        <span className="text-coral-foreground">{stats.disputePct}% · Membantah</span>
      </div>
      <div
        className="relative h-2.5 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={`Bukti: ${stats.supportPct}% mendukung, ${stats.disputePct}% membantah`}
      >
        <span
          className="aqsha-bar-grow absolute inset-y-0 left-0 rounded-full bg-[var(--mint)]"
          style={{ width: `${stats.supportPct}%` }}
        />
        <span
          className="aqsha-bar-grow absolute inset-y-0 right-0 rounded-full bg-[var(--coral)]"
          style={{ width: `${stats.disputePct}%`, transformOrigin: "right" }}
        />
        <span
          className="absolute top-1/2 z-10 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-foreground shadow-[0_0_0_1px_color-mix(in_oklch,var(--foreground)_25%,transparent)] transition-[left] duration-700 ease-out"
          style={{ left: `${stats.supportPct}%` }}
        />
      </div>

      {/* Klaim tiap sisi — baris ringkas */}
      <div className="mt-5 grid grid-cols-1 gap-x-5 gap-y-5 @lg/explore:grid-cols-2">
        <ClaimColumn tone="support" heading="Mendukung" claims={tension.support} />
        <ClaimColumn tone="dispute" heading="Membantah" claims={tension.dispute} />
      </div>
    </div>
  );
}

function ClaimColumn({
  tone,
  heading,
  claims,
}: {
  tone: "support" | "dispute";
  heading: string;
  claims: TensionClaim[];
}) {
  const support = tone === "support";
  return (
    <div>
      <div
        className={
          support
            ? "mb-2 flex items-center gap-1.5 font-mono text-[10px] text-mint-foreground"
            : "mb-2 flex items-center gap-1.5 font-mono text-[10px] text-coral-foreground"
        }
      >
        <span className={support ? "size-1.5 rounded-full bg-[var(--mint)]" : "size-1.5 rounded-full bg-[var(--coral)]"} />
        {heading}
        <span className="text-muted-foreground/70">· {claims.length}</span>
      </div>
      {claims.length === 0 ? (
        <p className="text-[12px] italic leading-snug text-muted-foreground">Tak ada klaim.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {claims.map((c, i) => (
            <li
              key={`${c.label}-${i}`}
              className={
                support
                  ? "rounded-lg border border-mint-soft-border bg-mint-soft px-2.5 py-1.5"
                  : "rounded-lg border border-coral-soft-border bg-coral-soft px-2.5 py-1.5"
              }
            >
              <p className="line-clamp-2 text-[12px] leading-snug text-foreground" title={c.label}>
                {c.label}
              </p>
              {c.weight != null ? (
                <span className="mt-0.5 inline-block font-mono text-[9.5px] text-muted-foreground">
                  bobot {c.weight}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
