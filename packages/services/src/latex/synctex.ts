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

/**
 * Koordinat file synctex = sp TeX (65536 sp = 1 pt TeX = 1/72.27 inch) dikali `unit`;
 * PDF point = 1/72 inch. Konversi di sini supaya konsumen (anotasi/overlay) hanya
 * berbicara dalam PDF point (satuan viewport pdf.js scale 1).
 */
export const SP_PER_PDF_POINT = (65536 * 72.27) / 72;

export function pdfPointToSp(pt: number): number {
  return pt * SP_PER_PDF_POINT;
}

export function spToPdfPoint(sp: number): number {
  return sp / SP_PER_PDF_POINT;
}

/** Inverse lookup dengan target dalam PDF point (origin kiri-atas halaman). */
export function synctexInverseLookupPdfPoint(
  data: SynctexData,
  target: { page: number; xPt: number; yPt: number },
): { file: string; line: number; distance: number } | null {
  const unit = data.unit || 1;
  return synctexInverseLookup(data, {
    page: target.page,
    x: pdfPointToSp(target.xPt) / unit,
    y: pdfPointToSp(target.yPt) / unit,
  });
}

/**
 * Forward lookup: (file, baris) → posisi PDF (halaman + titik dalam pt). Pilih record dengan
 * selisih baris terkecil pada file tersebut (match by suffix path — Tectonic menulis path
 * absolut tmpdir); seri dipecah oleh baris lebih kecil lalu halaman lebih awal. Dipakai
 * re-anchor marker anotasi lintas build (best-effort — baris yang bergeser jauh oleh
 * suntingan tampil sebagai basi, bukan salah tempat).
 */
export function synctexForwardLookup(
  data: SynctexData,
  target: { file: string; line: number },
): { page: number; xPt: number; yPt: number; line: number } | null {
  const tags = new Set(
    [...data.inputs.entries()].filter(([, p]) => p.endsWith(target.file)).map(([t]) => t),
  );
  if (tags.size === 0) return null;
  const unit = data.unit || 1;
  let best: { record: SynctexRecord; delta: number } | null = null;
  for (const record of data.records) {
    if (!tags.has(record.tag)) continue;
    const delta = Math.abs(record.line - target.line);
    if (!best || delta < best.delta || (delta === best.delta && record.page < best.record.page)) {
      best = { record, delta };
    }
  }
  if (!best) return null;
  return {
    page: best.record.page,
    xPt: spToPdfPoint(best.record.x * unit),
    yPt: spToPdfPoint(best.record.y * unit),
    line: best.record.line,
  };
}
