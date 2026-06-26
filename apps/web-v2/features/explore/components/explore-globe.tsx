"use client";

// Zona 1 kanan · Globe Mapbox. Lazy-mount saat dekat viewport, single instance
// (map.remove() di unmount), globe projection + fog. Node institusi + busur
// great-circle dari GeoJSON dummy (plan §7b). Tanpa token → placeholder sphere
// (tak crash). Theme-aware: setStyle saat tema berubah, layer re-inject di
// style.load. ponytail: mapbox di-type `any` (integrasi webgl dinamis).

import "mapbox-gl/dist/mapbox-gl.css";
import { GlobeIcon } from "@aqsha/ui/icons";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { GLOBE_ARCS, GLOBE_NODES } from "../data/explore-dummy";
import { arcsToGeoJSON, nodesToGeoJSON } from "../lib/globe-geo";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

const NODES_GEO = nodesToGeoJSON(GLOBE_NODES);
const ARCS_GEO = arcsToGeoJSON(GLOBE_NODES, GLOBE_ARCS);

type Palette = { node: string; emerging: string; arc: string };
const PALETTE: Record<"light" | "dark", Palette> = {
  light: { node: "#6b6356", emerging: "#2c55b5", arc: "#3a6ea5" },
  dark: { node: "#c9bfa8", emerging: "#9fc3e8", arc: "#8fb6d9" },
};

function styleUrl(dark: boolean) {
  return dark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11";
}

// Subset Map yang dipakai — hindari `any` & impor tipe penuh mapbox. Method
// syntax (bukan arrow) supaya instance Map asli assignable (varian bivariant).
type GlobeMap = {
  setFog(fog: Record<string, unknown>): void;
  getSource(id: string): unknown;
  addSource(id: string, source: unknown): void;
  getLayer(id: string): unknown;
  addLayer(layer: unknown): void;
  setPaintProperty(layer: string, prop: string, value: unknown): void;
  setStyle(style: string): void;
  remove(): void;
};

function injectLayers(map: GlobeMap, dark: boolean) {
  const pal = PALETTE[dark ? "dark" : "light"];
  try {
    // Space + atmosfer + bintang dibuat TRANSPARAN (rgba alpha 0) → hanya bola
    // globe yang tampil; sudut canvas tembus ke background halaman (light/dark).
    // Pakai rgba literal, BUKAN getComputedStyle: token oklch dikomputasi jadi
    // lab() yang ditolak parser warna mapbox ("color expected, lab(...) found").
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
    map.addSource("explore-arcs", { type: "geojson", data: ARCS_GEO });
  }
  if (!map.getSource("explore-nodes")) {
    map.addSource("explore-nodes", { type: "geojson", data: NODES_GEO });
  }
  if (!map.getLayer("explore-arcs")) {
    map.addLayer({
      id: "explore-arcs",
      type: "line",
      source: "explore-arcs",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": pal.arc, "line-width": 1.1, "line-opacity": 0.5 },
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
        "circle-radius": 11,
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
        "circle-radius": ["case", ["==", ["get", "emerging"], 1], 4.5, 3],
        "circle-color": ["case", ["==", ["get", "emerging"], 1], pal.emerging, pal.node],
        "circle-opacity": 0.92,
        "circle-stroke-width": 0.6,
        "circle-stroke-color": dark ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.5)",
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

export function ExploreGlobe() {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GlobeMap | null>(null);
  const themeRef = useRef(dark);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    themeRef.current = dark;
  }, [dark]);

  // Lazy-mount: only flip `visible` once the hero is near the viewport.
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

  // Init the single map instance once visible.
  useEffect(() => {
    if (!visible || !TOKEN || !containerRef.current || mapRef.current) return;
    let cancelled = false;
    let raf = 0;
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
          // Globe dekoratif (auto-rotate, tanpa hover/click). interactive:false
          // mematikan handler mouse → hindari bug mapbox unproject NaN saat kursor
          // di area "space" luar bola (Invalid LngLat (NaN, NaN) di mouseover).
          interactive: false,
        });
        mapRef.current = map;
        map.on("style.load", () => injectLayers(map, themeRef.current));
        map.on("error", (e: { error?: { message?: string } }) => {
          // Surface auth/tile errors (e.g. secret `sk.` token → 401) instead of
          // swallowing them — token must be a PUBLIC `pk.` token.
          console.error("[explore-globe] mapbox error:", e?.error?.message ?? e);
        });
        map.on("load", () => {
          const spin = () => {
            if (cancelled || !mapRef.current) return;
            const c = map.getCenter();
            c.lng = (c.lng + 0.06) % 360;
            map.setCenter(c);
            raf = requestAnimationFrame(spin);
          };
          raf = requestAnimationFrame(spin);
        });
      } catch (err) {
        console.error("[explore-globe] init failed:", err);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [visible]);

  // Theme toggle → swap base style; style.load re-injects our layers.
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

  return (
    <div className="relative flex h-full min-h-[420px] flex-col items-center justify-center">
      {showPlaceholder ? (
        <GlobePlaceholder reason={failed ? "failed" : "no-token"} />
      ) : (
        <div ref={containerRef} className="relative h-[420px] w-full [&_.mapboxgl-canvas]:outline-none" />
      )}

      <div className="relative mt-1.5 flex max-w-[90%] items-center gap-2 font-mono text-[11px] text-muted-foreground">
        <span className="size-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
        <span className="truncate">Node menyala = area berkembang · busur = kolaborasi</span>
      </div>
    </div>
  );
}

function GlobePlaceholder({ reason }: { reason: "no-token" | "failed" }) {
  return (
    <div className="relative flex h-[420px] w-full flex-col items-center justify-center gap-3">
      <div className="relative flex aspect-square w-[62%] items-center justify-center rounded-full border border-border bg-[radial-gradient(circle_at_35%_30%,color-mix(in_oklch,var(--primary)_10%,var(--card))_0%,var(--card)_70%)] shadow-aqsha">
        {/* meridian/parallel hint */}
        <div className="absolute inset-[10%] rounded-full border border-border/60" />
        <div className="absolute inset-y-[10%] left-1/2 w-px -translate-x-1/2 bg-border/50" />
        <div className="absolute inset-x-[10%] top-1/2 h-px -translate-y-1/2 bg-border/50" />
        <GlobeIcon className="size-9 text-muted-foreground/50" />
        {/* emerging node hints */}
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
