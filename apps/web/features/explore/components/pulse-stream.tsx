"use client";

// Hero kanan · "Tren riset" (compact). Streamgraph (d3-shape) volume riset per subtopik × tahun
// + scrubber hover. Data NYATA dari /explore/facets (OpenAlex group_by). Versi ringkas untuk slot
// hero yang sempit: double-bezel card, chart mengisi tinggi, legend padat. Badge trust &
// section-header besar SENGAJA dibuang (tak penting di widget kecil).

import { useMemo, useRef, useState } from "react";
import { buildStreamgraph } from "../lib/streamgraph";
import type { PulseData } from "../types";

const W = 460;
const H = 300;
const PAD_TOP = 14;
const PAD_BOTTOM = 22;
const PAD_X = 14;
const COLORS = ["var(--sky-foreground)", "var(--coral)", "var(--lemon-foreground)", "var(--mint)"];

export function PulseStream({
  pulse,
  loading,
  query,
}: {
  pulse?: PulseData;
  loading?: boolean;
  query?: string;
}) {
  const hasData = !!pulse && pulse.series.length > 0 && pulse.years.length > 1;

  const graph = useMemo(
    () =>
      hasData
        ? buildStreamgraph(pulse!, {
            width: W,
            height: H,
            padX: PAD_X,
            padTop: PAD_TOP,
            padBottom: PAD_BOTTOM,
          })
        : null,
    [pulse, hasData],
  );
  const colorByName = useMemo(() => {
    const m: Record<string, string> = {};
    pulse?.series.forEach((s, i) => {
      m[s.name] = COLORS[i % COLORS.length]!;
    });
    return m;
  }, [pulse]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const N = pulse?.years.length ?? 0;
  const idx = hover ?? Math.max(0, N - 1);

  const onMove = (e: React.MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || N < 2) return;
    const frac = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(N - 1, Math.round(frac * (N - 1)))));
  };

  const year = pulse?.years[idx];
  const lead = (pulse?.series ?? []).reduce(
    (best, s) => ((s.values[idx] ?? 0) > best.v ? { v: s.values[idx] ?? 0, n: s.name } : best),
    { v: -1, n: "" },
  );
  const scrubX = graph?.xAt(idx) ?? 0;
  // Width sempit → tampilkan tahun selang-seling + selalu tahun terakhir (hindari label berdesakan).
  const ticks = graph
    ? graph.ticks.filter((_, i) => i % 2 === 0 || i === graph.ticks.length - 1)
    : [];

  return (
    <div className="flex h-full min-h-[420px] flex-col rounded-[1.75rem] border border-border/70 bg-card/40 p-1.5">
      <div className="flex h-full flex-col rounded-[calc(1.75rem-0.375rem)] border border-border/40 bg-card/55 p-5 shadow-[inset_0_1px_0_color-mix(in_oklch,var(--foreground)_6%,transparent)]">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">
            Tren riset
          </h2>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {query?.trim() ? "topik ini" : "paling aktif"}
          </span>
        </div>

        <div className="relative mt-3 min-h-0 flex-1">
          {loading && !hasData ? (
            <div className="aqsha-shimmer size-full rounded-xl" />
          ) : !hasData || !graph ? (
            <div className="flex size-full items-center justify-center text-center font-mono text-[11px] text-muted-foreground">
              Belum ada data tren.
            </div>
          ) : (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="xMidYMid meet"
              className="block size-full cursor-crosshair"
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
              role="img"
              aria-label="Streamgraph volume riset per subtopik"
            >
              {graph.layers.map((layer) => (
                <path key={layer.name} d={layer.d} fill={colorByName[layer.name]} fillOpacity={0.9} />
              ))}
              <line
                x1={scrubX}
                y1={PAD_TOP}
                x2={scrubX}
                y2={H - PAD_BOTTOM}
                stroke="var(--muted-foreground)"
                strokeWidth={1}
                strokeDasharray="3 3"
                opacity={0.45}
              />
              {graph.layers.map((layer) => {
                const p = layer.points[idx];
                if (!p) return null;
                return (
                  <circle
                    key={`dot-${layer.name}`}
                    cx={p.x}
                    cy={(p.y0 + p.y1) / 2}
                    r={3}
                    fill={colorByName[layer.name]}
                    stroke="var(--card)"
                    strokeWidth={1}
                  />
                );
              })}
              {ticks.map((t) => (
                <text
                  key={t.label}
                  x={t.x}
                  y={H - 6}
                  textAnchor="middle"
                  className="fill-muted-foreground font-mono"
                  fontSize={9}
                >
                  {t.label}
                </text>
              ))}
            </svg>
          )}
        </div>

        {hasData ? (
          <div className="mt-3">
            <p className="font-mono text-[11px] text-muted-foreground">
              {year} · {lead.n} memimpin
            </p>
            <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1.5">
              {pulse!.series.map((s, i) => (
                <span key={s.name} className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2 shrink-0 rounded-[3px]"
                    style={{ background: COLORS[i % COLORS.length] }}
                  />
                  <span className="truncate text-[12px] text-muted-foreground">{s.name}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
