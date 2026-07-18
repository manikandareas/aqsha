import { gunzipSync } from "node:zlib";

export type SynctexRecord = {
  kind: string;
  tag: number;
  line: number;
  x: number;
  y: number;
  page: number;
};

export type SynctexData = {
  unit: number;
  magnification: number;
  xOffset: number;
  yOffset: number;
  /** tag → path file input (absolut; Tectonic sengaja menulis path absolut). */
  inputs: Map<number, string>;
  records: SynctexRecord[];
};

const INPUT_LINE = /^Input:(\d+):(.+)$/;
// Satu bentuk untuk record berkoordinat: pembuka box "(" "[", void box v/h,
// dan record titik x/k/g/$ — semuanya `<kind><tag>,<line>:<x>,<y>...`.
const RECORD_LINE = /^([([xkg$vh])(-?\d+),(-?\d+):(-?\d+),(-?\d+)/;
const PAGE_OPEN = /^\{(\d+)$/;

/**
 * Parser minimal format synctex (teks, gzip). Koordinat dibiarkan dalam satuan
 * mentah file (sp × unit); konsumen memutuskan konversi ke satuan PDF.
 */
export function parseSynctex(synctexGz: Uint8Array): SynctexData {
  const text = new TextDecoder().decode(gunzipSync(synctexGz));
  const inputs = new Map<number, string>();
  const records: SynctexRecord[] = [];
  let unit = 1;
  let magnification = 1000;
  let xOffset = 0;
  let yOffset = 0;
  let page = 0;

  for (const raw of text.split("\n")) {
    const input = raw.match(INPUT_LINE);
    if (input) {
      inputs.set(Number(input[1]), (input[2] ?? "").trim());
      continue;
    }
    if (raw.startsWith("Unit:")) {
      unit = Number(raw.slice(5)) || 1;
      continue;
    }
    if (raw.startsWith("Magnification:")) {
      magnification = Number(raw.slice(14)) || 1000;
      continue;
    }
    if (raw.startsWith("X Offset:")) {
      xOffset = Number(raw.slice(9)) || 0;
      continue;
    }
    if (raw.startsWith("Y Offset:")) {
      yOffset = Number(raw.slice(9)) || 0;
      continue;
    }
    const pageOpen = raw.match(PAGE_OPEN);
    if (pageOpen) {
      page = Number(pageOpen[1]);
      continue;
    }
    if (page === 0) continue;
    const rec = raw.match(RECORD_LINE);
    if (rec) {
      records.push({
        kind: rec[1] ?? "",
        tag: Number(rec[2]),
        line: Number(rec[3]),
        x: Number(rec[4]),
        y: Number(rec[5]),
        page,
      });
    }
  }
  return { unit, magnification, xOffset, yOffset, inputs, records };
}

/** Inverse mapping ala klik-ke-sumber: cari record terdekat pada halaman target. */
export function synctexInverseLookup(
  data: SynctexData,
  target: { page: number; x: number; y: number },
): { file: string; line: number; distance: number } | null {
  let best: { file: string; line: number; distance: number } | null = null;
  for (const record of data.records) {
    if (record.page !== target.page) continue;
    const distance = (record.x - target.x) ** 2 + (record.y - target.y) ** 2;
    if (!best || distance < best.distance) {
      best = {
        file: data.inputs.get(record.tag) ?? "",
        line: record.line,
        distance,
      };
    }
  }
  return best;
}
