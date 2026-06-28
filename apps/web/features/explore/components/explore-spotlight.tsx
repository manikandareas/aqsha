"use client";

// State Jelajah · "Sorotan minggu ini". Strip insight tipis dari DATA MURAH (pulse
// /explore/facets, OpenAlex group_by — sudah di-cache). Menghitung subtopik yang
// MEMIMPIN (volume tahun terakhir) + yang NAIK TERCEPAT (delta antar-tahun) tanpa
// memicu job LLM /explore/analysis. Chip = deep-link yang men-set query `q` → pindah
// ke state Selidiki. Mewarisi peran "Topik hangat" tapi dikemas naratif, bukan widget.

import { useMemo } from "react";
import type { PulseData } from "../types";

// Selaras urutan warna seri di pulse-stream.tsx & hot-topics.tsx (satu kesatuan visual).
const COLORS = ["var(--sky-foreground)", "var(--coral)", "var(--lemon-foreground)", "var(--mint)"];
const MAX_CHIPS = 6;

type TopicStat = { name: string; latest: number; growth: number; color: string };

export function ExploreSpotlight({
  pulse,
  loading,
  activeQuery,
  onSelect,
}: {
  pulse?: PulseData;
  loading?: boolean;
  activeQuery: string;
  onSelect: (q: string) => void;
}) {
  const stats = useMemo<TopicStat[]>(() => {
    const series = pulse?.series ?? [];
    return series.map((s, i) => {
      const last = s.values[s.values.length - 1] ?? 0;
      const first = s.values[0] ?? 0;
      return { name: s.name, latest: last, growth: last - first, color: COLORS[i % COLORS.length]! };
    });
  }, [pulse]);

  const hasData = stats.length > 0 && (pulse?.years.length ?? 0) > 1;

  // Insight: pemimpin (volume terakhir) + pelonjak (delta terbesar, beda dari pemimpin).
  const leader = useMemo(
    () => (hasData ? [...stats].sort((a, b) => b.latest - a.latest)[0] ?? null : null),
    [stats, hasData],
  );
  const riser = useMemo(() => {
    if (!hasData || !leader) return null;
    const r = [...stats].filter((s) => s.growth > 0).sort((a, b) => b.growth - a.growth)[0];
    return r && r.name !== leader.name ? r : null;
  }, [stats, hasData, leader]);

  const chips = useMemo(
    () => [...stats].sort((a, b) => b.latest - a.latest).slice(0, MAX_CHIPS),
    [stats],
  );
  const active = activeQuery.trim().toLowerCase();

  // Tanpa data & tidak loading → sembunyikan agar Jelajah tetap bersih.
  if (!hasData && !loading) return null;

  return (
    <section className="pt-8">
      <div className="rounded-2xl border border-border/60 bg-card/30 p-4 sm:p-5">
        {loading && !hasData ? (
          <div className="flex flex-col gap-3">
            <span className="aqsha-shimmer h-3.5 w-32 rounded-full" />
            <span className="aqsha-shimmer h-5 w-2/3 rounded-full" />
            <div className="mt-1 flex flex-wrap gap-2">
              {[72, 96, 80, 110].map((w) => (
                <span key={w} className="aqsha-shimmer h-7 rounded-full" style={{ width: w }} />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 @2xl/explore:flex-row @2xl/explore:items-center @2xl/explore:justify-between @2xl/explore:gap-8">
            <div className="min-w-0">
              <p className="font-mono text-[11px] tracking-wide text-muted-foreground">
                Sorotan minggu ini
              </p>
              <p className="mt-1.5 max-w-[520px] font-heading text-lg leading-snug text-foreground @2xl/explore:text-xl">
                {leader ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onSelect(leader.name)}
                      className="rounded-md font-semibold text-foreground underline decoration-primary/40 decoration-2 underline-offset-4 transition-colors hover:decoration-primary"
                    >
                      {leader.name}
                    </button>{" "}
                    memimpin riset saat ini
                    {riser ? (
                      <span className="text-muted-foreground">
                        {" · "}
                        <button
                          type="button"
                          onClick={() => onSelect(riser.name)}
                          className="rounded-md text-foreground underline decoration-mint-soft-border decoration-2 underline-offset-4 transition-colors hover:decoration-[var(--mint)]"
                        >
                          {riser.name}
                        </button>{" "}
                        naik tercepat
                      </span>
                    ) : null}
                  </>
                ) : (
                  "Subtopik paling aktif untuk minatmu"
                )}
              </p>
            </div>

            {chips.length > 0 ? (
              <div className="flex flex-wrap gap-2 @2xl/explore:shrink-0 @2xl/explore:justify-end">
                {chips.map((t) => {
                  const isActive = t.name.toLowerCase() === active;
                  return (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => onSelect(t.name)}
                      aria-pressed={isActive}
                      className={[
                        "group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] transition-[transform,border-color,color] duration-150 ease-out hover:-translate-y-px active:translate-y-0 active:scale-[0.97]",
                        isActive
                          ? "border-primary/50 bg-primary/10 text-foreground"
                          : "border-border bg-card/60 text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground",
                      ].join(" ")}
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: t.color }}
                        aria-hidden
                      />
                      <span className="min-w-0 truncate">{t.name}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
