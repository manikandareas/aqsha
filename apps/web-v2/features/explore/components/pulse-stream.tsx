"use client";

// Zona 1 · "Denyut bidang" — streamgraph centered (d3-shape) volume riset per
// subtopik × tahun, dengan scrubber hover + legend. Data dummy (plan §7c: path
// nyata = OpenAlex group_by publication_year).

import { useRef, useState } from "react";
import { PULSE_DATA } from "../data/explore-dummy";
import { buildStreamgraph } from "../lib/streamgraph";
import { TRUST_LEGEND, TrustBadge } from "../lib/trust";
import { SectionHeader } from "./section-header";

const W = 1124;
const H = 290;
const PAD_TOP = 18;
const PAD_BOTTOM = 26;

// Warna per seri (urutan asli), theme-aware via CSS var.
const COLORS = ["var(--sky-foreground)", "var(--coral)", "var(--lemon-foreground)", "var(--mint)"];
const COLOR_BY_NAME: Record<string, string> = {};
PULSE_DATA.series.forEach((s, i) => {
  COLOR_BY_NAME[s.name] = COLORS[i % COLORS.length];
});

const GRAPH = buildStreamgraph(PULSE_DATA, {
  width: W,
  height: H,
  padTop: PAD_TOP,
  padBottom: PAD_BOTTOM,
});

const N = PULSE_DATA.years.length;

export function PulseStream() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const idx = hover ?? N - 1;

  const onMove = (e: React.MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const frac = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(N - 1, Math.round(frac * (N - 1)))));
  };

  const year = PULSE_DATA.years[idx];
  const lead = PULSE_DATA.series.reduce(
    (best, s) => (s.values[idx] > best.v ? { v: s.values[idx], n: s.name } : best),
    { v: -1, n: "" },
  );
  const scrubX = GRAPH.xAt(idx);

  return (
    <section className="pt-16">
      <SectionHeader
        title="Denyut bidang"
        subtitle="Topik ini sedang naik, plateau, atau lewat?"
        right={
          <div className="flex flex-wrap gap-1.5">
            {TRUST_LEGEND.map((status) => (
              <TrustBadge key={status} status={status} />
            ))}
          </div>
        }
      />

      <div className="relative mt-5 border-y border-border">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          className="block w-full cursor-crosshair"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label="Streamgraph volume riset per subtopik 2019–2025"
        >
          {GRAPH.layers.map((layer) => (
            <path key={layer.name} d={layer.d} fill={COLOR_BY_NAME[layer.name]} fillOpacity={0.9} />
          ))}

          {/* scrubber */}
          <line
            x1={scrubX}
            y1={PAD_TOP}
            x2={scrubX}
            y2={H - PAD_BOTTOM}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.5}
          />
          {GRAPH.layers.map((layer) => {
            const p = layer.points[idx];
            return (
              <circle
                key={`dot-${layer.name}`}
                cx={p.x}
                cy={(p.y0 + p.y1) / 2}
                r={3.2}
                fill={COLOR_BY_NAME[layer.name]}
                stroke="var(--card)"
                strokeWidth={1}
              />
            );
          })}

          {/* year ticks */}
          {GRAPH.ticks.map((t) => (
            <text
              key={t.label}
              x={t.x}
              y={H - 9}
              textAnchor="middle"
              className="fill-muted-foreground font-mono"
              fontSize={10}
            >
              {t.label}
            </text>
          ))}
        </svg>
      </div>

      <p className="mt-2 font-mono text-[11px] text-muted-foreground">
        {year} · {lead.n} memimpin ({lead.v} paper)
      </p>

      <div className="mt-3.5 flex flex-wrap gap-4">
        {PULSE_DATA.series.map((s, i) => (
          <div key={s.name} className="inline-flex items-center gap-2">
            <span
              className="size-[11px] shrink-0 rounded-[3px]"
              style={{ background: COLORS[i % COLORS.length] }}
            />
            <span className="text-[13px] text-muted-foreground">{s.name}</span>
            <span className="font-mono text-[12px] text-muted-foreground/70">
              +{s.values[s.values.length - 1]}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
