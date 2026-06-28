"use client";

// Zona "Peta paper" (full-width). Node = paper NYATA relevan-secara-makna (OpenAlex
// `search.semantic`), warna per `field`, ukuran ∝ sitasi. Edge = kemiripan makna
// (related_works ∪ tumpang-tindih topik). Layout d3-force, render canvas (retina + theme-aware).
// Label anti-tumpang-tindih (greedy by ukuran; sisanya muncul saat hover). Hover → highlight +
// tooltip; drag → tata ulang; klik node → buka paper detail. Framing `border-y` agar konsisten
// dengan section lain (Tren riset, Masuk lebih dalam). Lazy-mount saat dekat viewport.

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";
import { bentoTileClass } from "@/lib/panel-surface";
import { TileHeader } from "./section-header";
import type { PaperEdge, PaperNode } from "../types";

// Tema ini sengaja warm/restrained: hanya coral/mint/lavender yang benar-benar jenuh.
// Maka 3 bidang TERSERING dapat hue khas (pop di gelap), sisanya netral — encoding
// terbaca tanpa keluar dari palet editorial (varian `*-foreground` = near-white, dihindari).
const VIVID_VARS = ["--coral", "--mint", "--lavender"];
const NEUTRAL_VAR = "--muted-foreground";
const LEGEND_MAX = 6;

/** field → CSS var, diurut frekuensi (paling banyak node dulu) → bidang dominan dapat warna pop. */
function fieldVarMapFor(nodes: PaperNode[]): Map<string, string> {
  const count = new Map<string, number>();
  for (const n of nodes) count.set(n.field, (count.get(n.field) ?? 0) + 1);
  const ordered = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
  const m = new Map<string, string>();
  ordered.forEach((f, i) => m.set(f, i < VIVID_VARS.length ? VIVID_VARS[i]! : NEUTRAL_VAR));
  return m;
}

type SimNode = SimulationNodeDatum & { idx: number; r: number; data: PaperNode };
type SimLink = SimulationLinkDatum<SimNode> & { w: number };
type Palette = { field: (f: string) => string; edge: string; stroke: string; text: string; font: string };

/**
 * Normalisasi warna CSS apa pun (oklch/hex/named) → "rgb(r, g, b)" via canvas 1px. WAJIB: di
 * theme ini `getComputedStyle().color` bisa `oklch(...)`; parsing alpha manual atasnya menghasilkan
 * warna ngawur (label merah, edge hilang). getImageData mengembalikan rgb sRGB yang sebenarnya.
 */
function toRgb(color: string): string {
  if (typeof document === "undefined") return "rgb(136, 136, 136)";
  const cv = document.createElement("canvas");
  cv.width = 1;
  cv.height = 1;
  const c = cv.getContext("2d");
  if (!c) return "rgb(136, 136, 136)";
  c.fillStyle = "#888888";
  c.fillStyle = color;
  c.fillRect(0, 0, 1, 1);
  const [r, g, b] = c.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

/** CSS custom property → rgb konkret (lewat toRgb). */
function resolveVar(name: string): string {
  if (typeof document === "undefined") return "rgb(136, 136, 136)";
  const el = document.createElement("span");
  el.style.color = `var(${name})`;
  el.style.position = "absolute";
  el.style.opacity = "0";
  el.style.pointerEvents = "none";
  document.body.appendChild(el);
  const c = getComputedStyle(el).color;
  el.remove();
  return toRgb(c || "#888888");
}

/** "rgb(r, g, b)" + alpha → "rgba(r, g, b, a)". */
function withAlpha(color: string, alpha: number): string {
  const m = color.match(/[\d.]+/g);
  return m && m.length >= 3 ? `rgba(${m[0]}, ${m[1]}, ${m[2]}, ${alpha})` : color;
}

/** Judul OpenAlex kadang ber-HTML/entity (`<i>`, `&lt;p&gt;`) → decode + strip tag + rapikan spasi. */
function cleanTitle(raw: string): string {
  return raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Radius node = log-normalisasi sitasi (5..14px). */
function radiiFor(nodes: PaperNode[]): number[] {
  const maxLog = Math.log1p(Math.max(1, ...nodes.map((n) => n.citedBy ?? 0)));
  return nodes.map((n) => 5 + (maxLog > 0 ? Math.log1p(n.citedBy ?? 0) / maxLog : 0) * 9);
}

/** Judul panjang → label pendek di batas kata (~30 char). */
function shortLabel(title: string): string {
  const t = cleanTitle(title);
  if (t.length <= 30) return t;
  const cut = t.slice(0, 30);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 16 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

function buildPalette(fieldVarMap: Map<string, string>): Palette {
  const rgbByField = new Map<string, string>();
  for (const [f, varName] of fieldVarMap) rgbByField.set(f, resolveVar(varName));
  const neutral = resolveVar(NEUTRAL_VAR);
  return {
    field: (f) => rgbByField.get(f) ?? neutral,
    edge: resolveVar("--muted-foreground"),
    stroke: resolveVar("--background"),
    text: resolveVar("--foreground"),
    font:
      typeof document === "undefined"
        ? "system-ui, sans-serif"
        : getComputedStyle(document.body).fontFamily || "system-ui, sans-serif",
  };
}

type Box = { x0: number; y0: number; x1: number; y1: number };
function intersects(a: Box, b: Box): boolean {
  return !(a.x1 < b.x0 || a.x0 > b.x1 || a.y1 < b.y0 || a.y0 > b.y1);
}

export function ExploreConstellation({
  nodes,
  edges,
  loading,
}: {
  nodes: PaperNode[];
  edges: PaperEdge[];
  loading?: boolean;
}) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null);

  const sig = useMemo(() => `${nodes.map((n) => n.key).join("|")}#${edges.length}`, [nodes, edges]);

  const simNodesRef = useRef<SimNode[]>([]);
  const paletteRef = useRef<Palette | null>(null);
  const hoverIdxRef = useRef<number | null>(null);
  const drawRef = useRef<() => void>(() => {});

  // Satu sumber field→warna (frekuensi-terurut) dipakai legend DAN palet canvas.
  const fieldVarMap = useMemo(() => fieldVarMapFor(nodes), [nodes]);

  const fieldLegend = useMemo(
    () => [...fieldVarMap.entries()].map(([field, varName]) => ({ field, varName })),
    [fieldVarMap],
  );

  useEffect(() => {
    const node = containerRef.current;
    if (!node || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || nodes.length === 0) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    paletteRef.current = buildPalette(fieldVarMap);
    const rs = radiiFor(nodes);
    let W = container.clientWidth || 900;
    let H = container.clientHeight || 440;

    const simNodes: SimNode[] = nodes.map((data, idx) => ({
      idx,
      r: rs[idx] ?? 6,
      data,
      x: W / 2 + Math.cos(idx * 1.7) * 160,
      y: H / 2 + Math.sin(idx * 1.7) * 110,
    }));
    const simLinks: SimLink[] = edges.map(([a, b, w]) => ({ source: a, target: b, w }));
    simNodesRef.current = simNodes;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sizeCanvas = () => {
      W = container.clientWidth || W;
      H = container.clientHeight || H;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    sizeCanvas();

    const drawLabel = (n: SimNode, opacity: number, bold: boolean, pal: Palette): Box | null => {
      if (n.x == null) return null;
      const label = shortLabel(n.data.title);
      ctx.font = `${bold ? "600" : "500"} ${bold ? 11.5 : 10.5}px ${pal.font}`;
      const w = ctx.measureText(label).width;
      const toRight = n.x + n.r + 7 + w <= W - 6;
      const tx = toRight ? n.x + n.r + 7 : n.x - n.r - 7;
      const ty = n.y ?? 0;
      const x0 = toRight ? tx : tx - w;
      const box: Box = { x0: x0 - 2, y0: ty - 7, x1: x0 + w + 2, y1: ty + 7 };
      ctx.textAlign = toRight ? "left" : "right";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;
      ctx.strokeStyle = withAlpha(pal.stroke, 0.95);
      ctx.strokeText(label, tx, ty);
      ctx.fillStyle = withAlpha(pal.text, opacity);
      ctx.fillText(label, tx, ty);
      return box;
    };

    const draw = () => {
      const pal = paletteRef.current;
      if (!pal) return;
      ctx.clearRect(0, 0, W, H);
      const hov = hoverIdxRef.current;

      for (const l of simLinks) {
        const s = l.source as SimNode;
        const t = l.target as SimNode;
        if (s.x == null || t.x == null) continue;
        const active = hov !== null && (s.idx === hov || t.idx === hov);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y ?? 0);
        ctx.lineTo(t.x, t.y ?? 0);
        ctx.strokeStyle = withAlpha(pal.edge, active ? 0.6 : 0.18 + l.w * 0.22);
        ctx.lineWidth = (active ? 1.6 : 0.7) + l.w * 1.2;
        ctx.stroke();
      }

      for (const n of simNodes) {
        if (n.x == null) continue;
        const active = hov === n.idx;
        ctx.globalAlpha = hov === null || active ? 1 : 0.5;
        ctx.beginPath();
        ctx.arc(n.x, n.y ?? 0, n.r + (active ? 2.5 : 0), 0, Math.PI * 2);
        ctx.fillStyle = pal.field(n.data.field);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = active ? 2 : 1;
        ctx.strokeStyle = withAlpha(pal.stroke, 0.95);
        ctx.stroke();
      }

      // Label greedy by ukuran (anti-tumpang-tindih) → rapi & terbaca; node terlewat → muncul saat hover.
      const placed: Box[] = [];
      const order = [...simNodes].sort((a, b) => b.r - a.r);
      for (const n of order) {
        if (n.idx === hov || n.x == null) continue;
        const label = shortLabel(n.data.title);
        ctx.font = `500 10.5px ${pal.font}`;
        const w = ctx.measureText(label).width;
        const toRight = n.x + n.r + 7 + w <= W - 6;
        const x0 = toRight ? n.x + n.r + 7 : n.x - n.r - 7 - w;
        const ty = n.y ?? 0;
        const box: Box = { x0: x0 - 2, y0: ty - 7, x1: x0 + w + 2, y1: ty + 7 };
        if (placed.some((p) => intersects(p, box))) continue;
        placed.push(box);
        drawLabel(n, hov !== null ? 0.45 : 0.82, false, pal);
      }
      // Hovered label selalu tampil, di atas semua.
      if (hov !== null) {
        const hn = simNodes.find((n) => n.idx === hov);
        if (hn) drawLabel(hn, 1, true, pal);
      }
    };
    drawRef.current = draw;

    const fx = forceX<SimNode>(W / 2).strength(0.03);
    const fy = forceY<SimNode>(H / 2).strength(0.05);
    const fc = forceCenter<SimNode>(W / 2, H / 2);
    const sim: Simulation<SimNode, SimLink> = forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.idx)
          .distance((l) => 52 + (1 - l.w) * 110)
          .strength((l) => 0.1 + l.w * 0.45),
      )
      .force("charge", forceManyBody<SimNode>().strength(-210))
      .force("collide", forceCollide<SimNode>().radius((d) => d.r + 18))
      .force("center", fc)
      .force("x", fx)
      .force("y", fy)
      .alpha(0.9)
      .alphaDecay(0.04)
      .on("tick", draw);

    const ro = new ResizeObserver(() => {
      sizeCanvas();
      fx.x(W / 2);
      fy.y(H / 2);
      fc.x(W / 2).y(H / 2);
      sim.alpha(Math.max(sim.alpha(), 0.3)).restart();
    });
    ro.observe(container);

    // ── Interaksi pointer: hover (tooltip), drag (tata ulang), klik (buka detail) ──
    let dragIdx: number | null = null;
    let down: { x: number; y: number } | null = null;
    let moved = false;

    const at = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const nearest = (x: number, y: number): SimNode | null => {
      let best: SimNode | null = null;
      let bestD = Number.POSITIVE_INFINITY;
      for (const n of simNodes) {
        if (n.x == null) continue;
        const dx = n.x - x;
        const dy = (n.y ?? 0) - y;
        const d = dx * dx + dy * dy;
        const reach = (n.r + 7) * (n.r + 7);
        if (d < reach && d < bestD) {
          bestD = d;
          best = n;
        }
      }
      return best;
    };

    const onDown = (e: PointerEvent) => {
      const p = at(e);
      down = p;
      moved = false;
      const n = nearest(p.x, p.y);
      if (n) {
        dragIdx = n.idx;
        n.fx = n.x;
        n.fy = n.y;
        sim.alphaTarget(0.2).restart();
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
    };
    const onMove = (e: PointerEvent) => {
      const p = at(e);
      if (dragIdx !== null) {
        const n = simNodes[dragIdx];
        if (n) {
          n.fx = p.x;
          n.fy = p.y;
        }
        if (down && (Math.abs(p.x - down.x) > 3 || Math.abs(p.y - down.y) > 3)) moved = true;
        return;
      }
      const n = nearest(p.x, p.y);
      hoverIdxRef.current = n ? n.idx : null;
      canvas.style.cursor = n ? "pointer" : "default";
      setHover(n && n.x != null ? { idx: n.idx, x: n.x, y: n.y ?? 0 } : null);
      if (sim.alpha() < 0.02) draw();
    };
    const onUp = (e: PointerEvent) => {
      const p = at(e);
      if (dragIdx !== null) {
        const n = simNodes[dragIdx];
        if (n) {
          n.fx = null;
          n.fy = null;
        }
        sim.alphaTarget(0);
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      const wasClick = !moved && down !== null;
      dragIdx = null;
      down = null;
      if (wasClick) {
        const n = nearest(p.x, p.y);
        if (n) router.push(`/app/explore/${encodeURIComponent(n.data.key)}`);
      }
    };
    const onLeave = () => {
      hoverIdxRef.current = null;
      setHover(null);
      canvas.style.cursor = "default";
      if (sim.alpha() < 0.02) draw();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave);

    return () => {
      sim.stop();
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [visible, sig, nodes, edges, router, fieldVarMap]);

  // Ganti tema → re-resolve palet + redraw (warna dihitung saat draw, node tak dimutasi).
  useEffect(() => {
    if (!visible || simNodesRef.current.length === 0) return;
    paletteRef.current = buildPalette(fieldVarMap);
    drawRef.current();
  }, [dark, visible, sig, fieldVarMap]);

  const hovered = hover ? nodes[hover.idx] : null;
  const isEmpty = nodes.length === 0;

  return (
    <div className={bentoTileClass("h-full min-h-[420px] sm:min-h-[460px]")}>
      <TileHeader
        title="Peta paper terkait"
        subtitle="titik = paper · garis = kemiripan makna"
        right={
          !isEmpty ? (
            <span className="font-mono text-[11px] text-muted-foreground">
              {nodes.length} paper · {edges.length} kaitan
            </span>
          ) : null
        }
      />

      <div
        ref={containerRef}
        className="relative mt-3 min-h-0 flex-1 overflow-hidden rounded-xl bg-[color-mix(in_oklch,var(--foreground)_3%,transparent)]"
      >
        {isEmpty ? (
          <ConstellationPlaceholder loading={loading} />
        ) : (
          <>
            <canvas ref={canvasRef} className="absolute inset-0 size-full touch-none" />
            {hovered && hover ? (
              <div
                className="pointer-events-none absolute z-10 max-w-[280px] -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-card px-3.5 py-2.5 shadow-aqsha"
                style={{ left: hover.x, top: hover.y - 14 }}
              >
                <p className="line-clamp-3 text-[13px] font-medium leading-snug text-foreground">
                  {cleanTitle(hovered.title)}
                </p>
                <p className="mt-1.5 font-mono text-[10.5px] text-muted-foreground">
                  {[
                    hovered.field,
                    hovered.year,
                    hovered.citedBy != null
                      ? `${hovered.citedBy.toLocaleString("id-ID")} sitasi`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="mt-1.5 font-mono text-[10px] text-primary">buka paper →</p>
              </div>
            ) : null}
          </>
        )}
      </div>

      {!isEmpty ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {fieldLegend.slice(0, LEGEND_MAX).map((f) => (
            <span key={f.field} className="inline-flex items-center gap-1.5">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: `var(${f.varName})` }}
              />
              <span className="text-[12px] text-muted-foreground">{f.field}</span>
            </span>
          ))}
          {fieldLegend.length > LEGEND_MAX ? (
            <span className="font-mono text-[11px] text-muted-foreground/70">
              +{fieldLegend.length - LEGEND_MAX} bidang
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ConstellationPlaceholder({ loading }: { loading?: boolean }) {
  const dots: Array<[number, number]> = [
    [40, 44],
    [100, 80],
    [160, 52],
    [122, 130],
    [66, 118],
  ];
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3">
      <svg viewBox="0 0 200 160" className="h-24 w-32" fill="none" aria-hidden="true">
        <g stroke="var(--border)" strokeWidth="1">
          <line x1="40" y1="44" x2="100" y2="80" />
          <line x1="100" y1="80" x2="160" y2="52" />
          <line x1="100" y1="80" x2="122" y2="130" />
          <line x1="40" y1="44" x2="66" y2="118" />
        </g>
        {dots.map(([cx, cy], i) => (
          <circle
            key={`${cx}-${cy}`}
            cx={cx}
            cy={cy}
            r={i === 1 ? 7 : 5}
            className="aqsha-node-pulse fill-muted-foreground/40"
            style={{ animationDelay: `${i * 0.4}s` }}
          />
        ))}
      </svg>
      <p className="max-w-[260px] text-center font-mono text-[10.5px] leading-relaxed text-muted-foreground">
        {loading ? "Memetakan paper terkait…" : "Belum ada paper terkait untuk dipetakan."}
      </p>
    </div>
  );
}
