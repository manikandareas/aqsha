// Builder GeoJSON untuk globe Mapbox (pure). Node institusi → titik; pasangan
// node → busur great-circle (interpolasi slerp di bola unit). Lihat explore-globe.tsx.
// ponytail: great-circle cukup slerp linear di unit sphere; tak perlu lib geodesi.

import type { GlobeArc, GlobeNode } from "../types";

type PointFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { label: string; emerging: number };
};

type LineFeature = {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: [number, number][] };
  properties: Record<string, never>;
};

export type FeatureCollection<F> = { type: "FeatureCollection"; features: F[] };

export function nodesToGeoJSON(nodes: GlobeNode[]): FeatureCollection<PointFeature> {
  return {
    type: "FeatureCollection",
    features: nodes.map((n) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [n.lon, n.lat] },
      properties: { label: n.label, emerging: n.emerging ? 1 : 0 },
    })),
  };
}

export function arcsToGeoJSON(
  nodes: GlobeNode[],
  arcs: GlobeArc[],
  steps = 48,
): FeatureCollection<LineFeature> {
  const features: LineFeature[] = [];
  for (const [a, b] of arcs) {
    const na = nodes[a];
    const nb = nodes[b];
    if (!na || !nb) continue;
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: greatCircle(na, nb, steps) },
      properties: {},
    });
  }
  return { type: "FeatureCollection", features };
}

const D = Math.PI / 180;

// Interpolasi great-circle antara dua koordinat (lon/lat) via slerp di unit sphere.
export function greatCircle(a: GlobeNode, b: GlobeNode, steps: number): [number, number][] {
  const va = toVec(a.lon, a.lat);
  const vb = toVec(b.lon, b.lat);
  const dot = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const omega = Math.acos(dot);
  const out: [number, number][] = [];
  if (omega < 1e-6) return [[a.lon, a.lat], [b.lon, b.lat]];
  const sinOmega = Math.sin(omega);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const s1 = Math.sin((1 - t) * omega) / sinOmega;
    const s2 = Math.sin(t * omega) / sinOmega;
    const x = s1 * va[0] + s2 * vb[0];
    const y = s1 * va[1] + s2 * vb[1];
    const z = s1 * va[2] + s2 * vb[2];
    out.push(fromVec(x, y, z));
  }
  return out;
}

function toVec(lon: number, lat: number): [number, number, number] {
  const la = lat * D;
  const lo = lon * D;
  return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
}

function fromVec(x: number, y: number, z: number): [number, number] {
  const lat = Math.atan2(z, Math.hypot(x, y)) / D;
  const lon = Math.atan2(y, x) / D;
  return [lon, lat];
}
