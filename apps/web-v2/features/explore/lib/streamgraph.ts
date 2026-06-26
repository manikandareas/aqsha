// Streamgraph centered (wiggle baseline + curveBasis smoothing) via d3-shape —
// "library chart" untuk zona Pulse. Pure: hitung path SVG + titik per-index untuk
// scrubber. Lihat pulse-stream.tsx. ponytail: pakai d3-shape (sudah faithful ke
// referensi), scale linear dihitung manual → tak perlu d3-scale.

import {
  area,
  curveBasis,
  type SeriesPoint,
  stack,
  stackOffsetWiggle,
  stackOrderInsideOut,
} from "d3-shape";
import type { PulseData } from "../types";

export type StreamPoint = { x: number; y0: number; y1: number };
export type StreamLayer = { name: string; index: number; d: string; points: StreamPoint[] };
export type StreamGraph = {
  layers: StreamLayer[];
  xAt: (i: number) => number;
  ticks: { x: number; label: string }[];
  width: number;
  height: number;
};

type Row = Record<string, number>;

export function buildStreamgraph(
  data: PulseData,
  opts: { width: number; height: number; padX?: number; padTop?: number; padBottom?: number },
): StreamGraph {
  const { width, height } = opts;
  const padX = opts.padX ?? 22;
  const padTop = opts.padTop ?? 18;
  const padBottom = opts.padBottom ?? 26;
  const n = data.years.length;
  const names = data.series.map((s) => s.name);

  // Satu record per index-tahun, dikunci nama seri.
  const rows: Row[] = data.years.map((_, i) => {
    const row: Row = {};
    for (const s of data.series) row[s.name] = s.values[i] ?? 0;
    return row;
  });

  const stacked = stack<Row>()
    .keys(names)
    .offset(stackOffsetWiggle)
    .order(stackOrderInsideOut)(rows);

  let yMin = Infinity;
  let yMax = -Infinity;
  for (const layer of stacked) {
    for (const p of layer) {
      yMin = Math.min(yMin, p[0], p[1]);
      yMax = Math.max(yMax, p[0], p[1]);
    }
  }
  const span = yMax - yMin || 1;
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;
  const xAt = (i: number) => padX + (plotW * i) / Math.max(1, n - 1);
  const yAt = (v: number) => padTop + plotH * (1 - (v - yMin) / span);

  const areaGen = area<SeriesPoint<Row>>()
    .x((_d, i) => xAt(i))
    .y0((d) => yAt(d[0]))
    .y1((d) => yAt(d[1]))
    .curve(curveBasis);

  const layers: StreamLayer[] = stacked.map((layer, index) => ({
    name: layer.key,
    index,
    d: areaGen(layer) ?? "",
    points: layer.map((p, i) => ({ x: xAt(i), y0: yAt(p[0]), y1: yAt(p[1]) })),
  }));

  const ticks = data.years.map((y, i) => ({ x: xAt(i), label: String(y) }));
  return { layers, xAt, ticks, width, height };
}
