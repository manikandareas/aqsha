"use client";

// Zona 1 kanan · Globe Mapbox INTERAKTIF. Node = negara penghasil riset (radius ∝
// jumlah paper), busur = kolaborasi internasional (lebar ∝ ko-publikasi). Data nyata
// dari /explore/facets (OpenAlex group_by) lewat props; berubah saat query `q` berubah
// (setData, bukan re-init map). Interaktif: hover node → highlight (feature-state) +
// kursor pointer; klik → popup negara + jumlah paper + flyTo; drag → auto-spin berhenti
// lalu lanjut saat idle. interactive:true aman dari bug unproject NaN karena event
// di-scope ke layer ('explore-nodes'), bukan global mouseover + unproject manual.
// Tanpa token → placeholder sphere. Theme-aware: setStyle + re-inject layer di style.load.

import "mapbox-gl/dist/mapbox-gl.css";
import { GlobeIcon } from "@aqsha/ui/icons";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";
import { arcsToGeoJSON, type FeatureCollection, nodesToGeoJSON } from "../lib/globe-geo";
import type { GlobeArc, GlobeNode } from "../types";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

type Palette = { node: string; emerging: string; arc: string };
const PALETTE: Record<"light" | "dark", Palette> = {
  light: { node: "#6b6356", emerging: "#2c55b5", arc: "#3a6ea5" },
  dark: { node: "#c9bfa8", emerging: "#9fc3e8", arc: "#8fb6d9" },
};

function styleUrl(dark: boolean) {
  return dark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11";
}

type GeoSource = { setData(data: unknown): void };
type MapFeature = {
  id?: number;
  properties?: Record<string, unknown>;
  geometry?: { coordinates?: [number, number] };
};
type MapEvt = { features?: MapFeature[]; lngLat?: { lng: number; lat: number } };
type Handler = (e: MapEvt) => void;

// Subset Map yang dipakai (hindari impor tipe penuh mapbox; method syntax = bivariant).
type GlobeMap = {
  setFog(fog: Record<string, unknown>): void;
  getSource(id: string): GeoSource | undefined;
  addSource(id: string, source: unknown): void;
  getLayer(id: string): unknown;
  addLayer(layer: unknown): void;
  setPaintProperty(layer: string, prop: string, value: unknown): void;
  setStyle(style: string): void;
  remove(): void;
  on(type: string, layer: string, handler: Handler): void;
  on(type: string, handler: () => void): void;
  setFeatureState(target: { source: string; id: number }, state: Record<string, unknown>): void;
  removeFeatureState(target: { source: string; id?: number }): void;
  flyTo(opts: Record<string, unknown>): void;
  getCanvas(): HTMLCanvasElement;
  getCenter(): { lng: number; lat: number };
  setCenter(c: { lng: number; lat: number }): void;
};

/** Radius lingkaran node = interpolasi count (paper) + bonus saat hover. */
function radiusExpr(maxCount: number): unknown {
  const max = Math.max(1, maxCount);
  return [
    "+",
    ["interpolate", ["linear"], ["get", "count"], 0, 3, max, 9.5],
    ["case", ["boolean", ["feature-state", "hover"], false], 3.5, 0],
  ];
}

/** Lebar busur = interpolasi weight (ko-publikasi) + emphasis saat hover. */
function arcWidthExpr(maxWeight: number): unknown {
  const max = Math.max(1, maxWeight);
  return [
    "+",
    ["interpolate", ["linear"], ["get", "weight"], 1, 0.7, max, 2.6],
    ["case", ["boolean", ["feature-state", "hover"], false], 1.4, 0],
  ];
}

function injectLayers(
  map: GlobeMap,
  dark: boolean,
  geo: { nodes: FeatureCollection<unknown>; arcs: FeatureCollection<unknown> },
  maxCount: number,
  maxWeight: number,
) {
  const pal = PALETTE[dark ? "dark" : "light"];
  try {
    map.setFog({
      color: "rgba(0, 0, 0, 0)",
      "high-color": "rgba(0, 0, 0, 0)",
      "space-color": "rgba(0, 0, 0, 0)",
      "horizon-blend": 0,
      "star-intensity": 0,
    });
  } catch {
    /* ignore */
  }
  if (!map.getSource("explore-arcs")) {
    map.addSource("explore-arcs", { type: "geojson", data: geo.arcs });
  }
  if (!map.getSource("explore-nodes")) {
    map.addSource("explore-nodes", { type: "geojson", data: geo.nodes });
  }
  if (!map.getLayer("explore-arcs")) {
    map.addLayer({
      id: "explore-arcs",
      type: "line",
      source: "explore-arcs",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": pal.arc,
        "line-width": arcWidthExpr(maxWeight),
        "line-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          0.85,
          0.45,
        ],
      },
    });
  } else {
    map.setPaintProperty("explore-arcs", "line-color", pal.arc);
  }
  if (!map.getLayer("explore-nodes-halo")) {
    map.addLayer({
      id: "explore-nodes-halo",
      type: "circle",
      source: "explore-nodes",
      filter: ["==", ["get", "emerging"], 1],
      paint: {
        "circle-radius": 12,
        "circle-color": pal.emerging,
        "circle-opacity": 0.18,
        "circle-blur": 0.6,
      },
    });
  } else {
    map.setPaintProperty("explore-nodes-halo", "circle-color", pal.emerging);
  }
  if (!map.getLayer("explore-nodes")) {
    map.addLayer({
      id: "explore-nodes",
      type: "circle",
      source: "explore-nodes",
      paint: {
        "circle-radius": radiusExpr(maxCount),
        "circle-color": ["case", ["==", ["get", "emerging"], 1], pal.emerging, pal.node],
        "circle-opacity": 0.92,
        "circle-stroke-width": 0.8,
        "circle-stroke-color": dark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.6)",
      },
    });
  } else {
    map.setPaintProperty("explore-nodes", "circle-color", [
      "case",
      ["==", ["get", "emerging"], 1],
      pal.emerging,
      pal.node,
    ]);
  }
}

export function ExploreGlobe({
  nodes,
  arcs,
  loading,
}: {
  nodes: GlobeNode[];
  arcs: GlobeArc[];
  loading?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GlobeMap | null>(null);
  const themeRef = useRef(dark);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);

  const nodesGeo = useMemo(() => nodesToGeoJSON(nodes), [nodes]);
  const arcsGeo = useMemo(() => arcsToGeoJSON(nodes, arcs), [nodes, arcs]);
  const maxCount = useMemo(() => Math.max(1, ...nodes.map((n) => n.count ?? 0)), [nodes]);
  const maxWeight = useMemo(() => Math.max(1, ...arcs.map((a) => a[2] ?? 1)), [arcs]);

  // Ref dibaca injectLayers (re-inject di style.load) supaya selalu pakai data terbaru.
  // Di-update di effect data (bukan saat render).
  const geoRef = useRef({ nodes: nodesGeo, arcs: arcsGeo, maxCount, maxWeight });

  useEffect(() => {
    themeRef.current = dark;
  }, [dark]);

  // Lazy-mount saat hero dekat viewport.
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

  // Init single map instance.
  useEffect(() => {
    if (!visible || !TOKEN || !containerRef.current || mapRef.current) return;
    let cancelled = false;
    let raf = 0;
    let interacting = false;
    let resumeTimer: ReturnType<typeof setTimeout> | null = null;
    let hoveredNode: number | null = null;
    let hoveredArc: number | null = null;

    (async () => {
      try {
        const mapboxgl = (await import("mapbox-gl")).default;
        if (cancelled || !containerRef.current) return;
        mapboxgl.accessToken = TOKEN;
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: styleUrl(themeRef.current),
          projection: "globe",
          center: [40, 18],
          zoom: 1.05,
          interactive: true,
          attributionControl: false,
        }) as unknown as GlobeMap;
        mapRef.current = map;

        map.on("style.load", () => {
          const g = geoRef.current;
          injectLayers(map, themeRef.current, g, g.maxCount, g.maxWeight);
        });
        map.on("error", (() => {}) as () => void);

        const pause = () => {
          interacting = true;
          if (resumeTimer) clearTimeout(resumeTimer);
        };
        const resumeSoon = () => {
          if (resumeTimer) clearTimeout(resumeTimer);
          resumeTimer = setTimeout(() => {
            interacting = false;
          }, 2600);
        };
        (map.on as (t: string, h: () => void) => void)("mousedown", pause);
        (map.on as (t: string, h: () => void) => void)("dragstart", pause);
        (map.on as (t: string, h: () => void) => void)("mouseup", resumeSoon);
        (map.on as (t: string, h: () => void) => void)("dragend", resumeSoon);

        const setNodeHover = (id: number | null) => {
          if (hoveredNode !== null && hoveredNode !== id) {
            map.removeFeatureState({ source: "explore-nodes", id: hoveredNode });
          }
          hoveredNode = id;
          if (id !== null) map.setFeatureState({ source: "explore-nodes", id }, { hover: true });
        };
        const setArcHover = (id: number | null) => {
          if (hoveredArc !== null && hoveredArc !== id) {
            map.removeFeatureState({ source: "explore-arcs", id: hoveredArc });
          }
          hoveredArc = id;
          if (id !== null) map.setFeatureState({ source: "explore-arcs", id }, { hover: true });
        };

        map.on("load", () => {
          // Hover node → highlight + pointer.
          map.on("mousemove", "explore-nodes", (e) => {
            const f = e.features?.[0];
            if (f?.id === undefined) return;
            map.getCanvas().style.cursor = "pointer";
            setNodeHover(Number(f.id));
          });
          map.on("mouseleave", "explore-nodes", () => {
            map.getCanvas().style.cursor = "";
            setNodeHover(null);
          });
          // Hover arc → tebalkan.
          map.on("mousemove", "explore-arcs", (e) => {
            const f = e.features?.[0];
            if (f?.id === undefined) return;
            setArcHover(Number(f.id));
          });
          map.on("mouseleave", "explore-arcs", () => setArcHover(null));

          // Klik node → popup + flyTo.
          map.on("click", "explore-nodes", (e) => {
            const f = e.features?.[0];
            const coords = f?.geometry?.coordinates;
            if (!coords) return;
            const p = f?.properties ?? {};
            const label = String(p.label ?? "Negara");
            const count = Number(p.count ?? 0);
            const emerging = Number(p.emerging ?? 0) === 1;
            new mapboxgl.Popup({ closeButton: true, offset: 10, maxWidth: "220px" })
              .setLngLat(coords)
              .setHTML(
                `<div style="font-family:var(--font-sans,system-ui);padding:2px 2px 4px">` +
                  `<div style="font-weight:600;font-size:13px">${escapeHtml(label)}</div>` +
                  `<div style="font-size:11px;color:#6b7280;margin-top:2px">${count.toLocaleString("id-ID")} paper</div>` +
                  (emerging
                    ? `<div style="font-size:10px;color:#2c55b5;margin-top:3px">● area berkembang</div>`
                    : "") +
                  `</div>`,
              )
              .addTo(map as never);
            pause();
            map.flyTo({ center: coords, zoom: 2.4, duration: 1100 });
            resumeSoon();
          });

          const spin = () => {
            if (cancelled || !mapRef.current) return;
            if (!interacting) {
              const c = map.getCenter();
              c.lng = (c.lng + 0.055) % 360;
              map.setCenter(c);
            }
            raf = requestAnimationFrame(spin);
          };
          raf = requestAnimationFrame(spin);
        });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (resumeTimer) clearTimeout(resumeTimer);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [visible]);

  // Data berubah (query baru) → simpan ke ref + update sources + radius/width (tanpa re-init).
  useEffect(() => {
    geoRef.current = { nodes: nodesGeo, arcs: arcsGeo, maxCount, maxWeight };
    const map = mapRef.current;
    if (!map) return;
    map.getSource("explore-nodes")?.setData(nodesGeo);
    map.getSource("explore-arcs")?.setData(arcsGeo);
    try {
      map.setPaintProperty("explore-nodes", "circle-radius", radiusExpr(maxCount));
      map.setPaintProperty("explore-arcs", "line-width", arcWidthExpr(maxWeight));
    } catch {
      /* layer belum siap */
    }
  }, [nodesGeo, arcsGeo, maxCount, maxWeight]);

  // Theme toggle → swap style; style.load re-inject layer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    try {
      map.setStyle(styleUrl(dark));
    } catch {
      /* ignore */
    }
  }, [dark]);

  const showPlaceholder = !TOKEN || failed;
  const caption =
    nodes.length > 0
      ? `${nodes.length} negara · ${arcs.length} kolaborasi`
      : loading
        ? "Memuat peta riset…"
        : "Node = negara riset · busur = kolaborasi";

  return (
    <div className="relative flex h-full min-h-[420px] flex-col items-center justify-center">
      {showPlaceholder ? (
        <GlobePlaceholder reason={failed ? "failed" : "no-token"} />
      ) : (
        <div
          ref={containerRef}
          className="relative h-[420px] w-full [&_.mapboxgl-canvas]:outline-none"
        />
      )}

      <div className="relative mt-1.5 flex max-w-[90%] items-center gap-2 font-mono text-[11px] text-muted-foreground">
        <span className="size-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
        <span className="truncate">{caption}</span>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

function GlobePlaceholder({ reason }: { reason: "no-token" | "failed" }) {
  return (
    <div className="relative flex h-[420px] w-full flex-col items-center justify-center gap-3">
      <div className="relative flex aspect-square w-[62%] items-center justify-center rounded-full border border-border bg-[radial-gradient(circle_at_35%_30%,color-mix(in_oklch,var(--primary)_10%,var(--card))_0%,var(--card)_70%)] shadow-aqsha">
        <div className="absolute inset-[10%] rounded-full border border-border/60" />
        <div className="absolute inset-y-[10%] left-1/2 w-px -translate-x-1/2 bg-border/50" />
        <div className="absolute inset-x-[10%] top-1/2 h-px -translate-y-1/2 bg-border/50" />
        <GlobeIcon className="size-9 text-muted-foreground/50" />
        <span className="aqsha-node-pulse absolute left-[30%] top-[34%] size-2 rounded-full bg-sky-foreground" />
        <span className="aqsha-node-pulse absolute right-[28%] top-[44%] size-2 rounded-full bg-sky-foreground [animation-delay:0.7s]" />
        <span className="aqsha-node-pulse absolute bottom-[30%] left-[46%] size-2 rounded-full bg-sky-foreground [animation-delay:1.2s]" />
      </div>
      <p className="max-w-[260px] text-center font-mono text-[10.5px] leading-relaxed text-muted-foreground">
        {reason === "no-token"
          ? "Pratinjau globe · setel NEXT_PUBLIC_MAPBOX_TOKEN untuk globe interaktif"
          : "Globe tak dapat dimuat · menampilkan pratinjau"}
      </p>
    </div>
  );
}
