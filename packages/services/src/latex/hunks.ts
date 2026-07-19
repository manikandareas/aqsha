import { applyPatch, structuredPatch } from "diff";

export type ProposalHunk = {
  /** Identitas yang dirujuk reviewer saat accept parsial; stabil selama basis tak berubah. */
  index: number;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Prefiks ' ' konteks, '-' hapus, '+' tambah, '\' marker no-newline. */
  lines: string[];
};

/**
 * Hunks diff basis→usulan. Deterministik untuk input sama (context tetap 3) — dihitung di
 * getPending untuk display dan dihitung ulang saat accept; kesamaan hasil dijamin karena
 * kedua sisi memakai fungsi ini atas basis yang sama (guard versi di jalur accept).
 */
export function computeProposalHunks(
  baseSource: string,
  proposedSource: string,
): ProposalHunk[] {
  const patch = structuredPatch("a", "b", baseSource, proposedSource, undefined, undefined, {
    context: 3,
  });
  return patch.hunks.map((hunk, index) => ({
    index,
    oldStart: hunk.oldStart,
    oldLines: hunk.oldLines,
    newStart: hunk.newStart,
    newLines: hunk.newLines,
    lines: hunk.lines,
  }));
}

/**
 * Terapkan subset hunk ke basis. Hunk hasil satu structuredPatch terurut dan tak tumpang
 * tindih, jadi cukup geser newStart hunk terpilih (posisi di file hasil bergeser saat hunk
 * sebelumnya dibuang) lalu serahkan ke applyPatch dengan fuzz 0 — konteks wajib cocok
 * persis. Gagal apply berarti basis bukan basis diff → bug pemanggil, bukan input user.
 */
export function applyHunkSelection(
  baseSource: string,
  hunks: ProposalHunk[],
  acceptedIndexes: ReadonlySet<number>,
): string {
  const selected = hunks.filter((hunk) => acceptedIndexes.has(hunk.index));
  if (selected.length === 0) return baseSource;
  let delta = 0;
  const adjusted = selected.map((hunk) => {
    const shifted = {
      oldStart: hunk.oldStart,
      oldLines: hunk.oldLines,
      newStart: hunk.oldStart + delta,
      newLines: hunk.newLines,
      lines: hunk.lines,
    };
    delta += hunk.newLines - hunk.oldLines;
    return shifted;
  });
  const result = applyPatch(baseSource, {
    oldFileName: "a",
    newFileName: "b",
    oldHeader: undefined,
    newHeader: undefined,
    hunks: adjusted,
  });
  if (result === false) {
    throw new Error("Subset hunk tidak dapat diterapkan ke sumber basis");
  }
  return result;
}
