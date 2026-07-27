/**
 * Kerangka dokumen Typst: pembacaan heading berlevel beserta jumlah kata subtree, pemotongan
 * satu bagian, dan transformasi struktur bab. Murni supaya dapat diuji tanpa DB maupun compile.
 * Operasi struktur sengaja hanya menyentuh bab level-1 karena itulah satuan yang dikelola user
 * lewat daftar isi; subbab ikut terbawa sebagai isi babnya.
 */

export type OutlineHeading = {
  /** Urutan kemunculan lintas semua level, 0-based. */
  index: number;
  /** Urutan di antara bab level-1, atau null untuk heading yang lebih dalam. */
  chapterIndex: number | null;
  level: number;
  title: string;
  /** Baris sumber 1-based. */
  line: number;
  /** Jumlah kata badan heading ini termasuk seluruh subbabnya, tanpa teks judul. */
  words: number;
  isEmpty: boolean;
};

export type OutlineSection = {
  index: number;
  title: string;
  level: number;
  startLine: number;
  endLine: number;
  text: string;
};

export type OutlineOperation =
  | { op: "insert"; afterChapterIndex: number | null; title: string }
  | { op: "rename"; chapterIndex: number; title: string }
  | { op: "move"; chapterIndex: number; toChapterIndex: number }
  | { op: "remove"; chapterIndex: number };

const HEADING_RE = /^(={1,6})[ \t]+(\S.*?)[ \t]*$/;

function isCommentLine(line: string): boolean {
  return line.trimStart().startsWith("//");
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

type RawHeading = {
  index: number;
  chapterIndex: number | null;
  level: number;
  title: string;
  line: number;
};

function rawHeadings(lines: string[]): RawHeading[] {
  const out: RawHeading[] = [];
  let chapters = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (isCommentLine(line)) continue;
    const m = HEADING_RE.exec(line);
    if (!m) continue;
    const level = m[1]!.length;
    out.push({
      index: out.length,
      chapterIndex: level === 1 ? chapters++ : null,
      level,
      title: m[2]!,
      line: i + 1,
    });
  }
  return out;
}

/** Baris terakhir subtree heading ke-`i` (sampai sebelum heading berikut yang selevel atau lebih tinggi). */
function subtreeEndLine(heads: RawHeading[], i: number, totalLines: number): number {
  const head = heads[i]!;
  const next = heads.slice(i + 1).find((h) => h.level <= head.level);
  return next ? next.line - 1 : totalLines;
}

export function parseTypstOutline(source: string): OutlineHeading[] {
  const lines = source.split("\n");
  const heads = rawHeadings(lines);
  return heads.map((head, i) => {
    const endLine = subtreeEndLine(heads, i, lines.length);
    let words = 0;
    for (let ln = head.line + 1; ln <= endLine; ln += 1) {
      const body = lines[ln - 1]!;
      // Judul subbab bukan isi bab — jangan ikut dihitung.
      if (HEADING_RE.test(body)) continue;
      words += countWords(body);
    }
    return {
      index: head.index,
      chapterIndex: head.chapterIndex,
      level: head.level,
      title: head.title,
      line: head.line,
      words,
      isEmpty: words === 0,
    };
  });
}

export function sliceOutlineSection(source: string, index: number): OutlineSection | null {
  const lines = source.split("\n");
  const heads = rawHeadings(lines);
  const head = heads[index];
  if (!head) return null;
  const endLine = subtreeEndLine(heads, index, lines.length);
  return {
    index,
    title: head.title,
    level: head.level,
    startLine: head.line,
    endLine,
    text: lines.slice(head.line - 1, endLine).join("\n"),
  };
}

function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

export function findOutlineSectionByTitle(source: string, title: string): OutlineSection | null {
  const needle = normalizeTitle(title);
  if (!needle) return null;
  const heads = rawHeadings(source.split("\n"));
  const hit =
    heads.find((h) => normalizeTitle(h.title) === needle) ??
    heads.find((h) => normalizeTitle(h.title).includes(needle));
  return hit ? sliceOutlineSection(source, hit.index) : null;
}

/** Dokumen dipecah jadi preamble (sebelum bab pertama) + satu blok baris per bab level-1. */
function splitChapters(source: string): { preamble: string[]; blocks: string[][] } {
  const lines = source.split("\n");
  const heads = rawHeadings(lines).filter((h) => h.level === 1);
  if (heads.length === 0) return { preamble: lines, blocks: [] };
  const preamble = lines.slice(0, heads[0]!.line - 1);
  const blocks = heads.map((head, i) => {
    const end = heads[i + 1] ? heads[i + 1]!.line - 1 : lines.length;
    return lines.slice(head.line - 1, end);
  });
  return { preamble, blocks };
}

function joinChapters(preamble: string[], blocks: string[][]): string {
  return [...preamble, ...blocks.flat()].join("\n");
}

function assertChapter(blocks: string[][], index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= blocks.length) {
    throw new Error("Bab tidak ditemukan");
  }
}

export function applyOutlineOperations(source: string, ops: OutlineOperation[]): string {
  let current = source;
  for (const op of ops) {
    const { preamble, blocks } = splitChapters(current);
    if (op.op === "insert") {
      const block = [`= ${op.title.trim()}`, ""];
      if (op.afterChapterIndex === null) {
        blocks.push(block);
      } else {
        assertChapter(blocks, op.afterChapterIndex);
        blocks.splice(op.afterChapterIndex + 1, 0, block);
      }
    } else if (op.op === "rename") {
      assertChapter(blocks, op.chapterIndex);
      blocks[op.chapterIndex] = [`= ${op.title.trim()}`, ...blocks[op.chapterIndex]!.slice(1)];
    } else if (op.op === "remove") {
      assertChapter(blocks, op.chapterIndex);
      blocks.splice(op.chapterIndex, 1);
    } else {
      assertChapter(blocks, op.chapterIndex);
      const [moved] = blocks.splice(op.chapterIndex, 1);
      const target = Math.min(Math.max(op.toChapterIndex, 0), blocks.length);
      blocks.splice(target, 0, moved!);
    }
    current = joinChapters(preamble, blocks);
  }
  return current;
}
