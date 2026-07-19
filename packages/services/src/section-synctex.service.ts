import { type Db, LatexBuildRepo } from "@aqsha/db";
import { sectionFilePath } from "./latex/assembly.service";
import {
  parseSynctex,
  type SynctexData,
  synctexForwardLookup,
  synctexInverseLookupPdfPoint,
} from "./latex/synctex";
import { SectionService } from "./section.service";
import { StorageService } from "./storage.service";

// Cache kecil ber-key build (builtAt membedakan upsert in-place) — sama pola annotation.service.
const SYNCTEX_CACHE_MAX = 8;
const synctexCache = new Map<string, SynctexData>();

async function loadSynctex(buildKey: string, r2Key: string): Promise<SynctexData | null> {
  const cached = synctexCache.get(buildKey);
  if (cached) return cached;
  try {
    const bytes = await StorageService.readBytes(r2Key);
    const data = parseSynctex(bytes);
    if (synctexCache.size >= SYNCTEX_CACHE_MAX) {
      const oldest = synctexCache.keys().next().value;
      if (oldest !== undefined) synctexCache.delete(oldest);
    }
    synctexCache.set(buildKey, data);
    return data;
  } catch {
    return null;
  }
}

/** Inverse: titik PDF → baris, hanya bila record terdekat milik file body bab. Diekspor untuk tes. */
export function pickBodyLine(
  data: SynctexData,
  bodyPath: string,
  target: { page: number; xPt: number; yPt: number },
): { line: number } | null {
  const hit = synctexInverseLookupPdfPoint(data, target);
  if (!hit || !hit.file.endsWith(bodyPath)) return null;
  return { line: hit.line };
}

/** Forward: baris body → posisi PDF. Diekspor untuk tes. */
export function pickBodyPosition(
  data: SynctexData,
  bodyPath: string,
  line: number,
): { page: number; xPt: number; yPt: number } | null {
  const pos = synctexForwardLookup(data, { file: bodyPath, line });
  if (!pos) return null;
  return { page: pos.page, xPt: pos.xPt, yPt: pos.yPt };
}

export const SectionSynctexService = {
  async inverse(
    db: Db,
    input: { ownerUserId: string; sectionId: string; page: number; xPt: number; yPt: number },
  ): Promise<{ line: number } | null> {
    await SectionService.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    const build = await LatexBuildRepo.findBySection(db, input.ownerUserId, input.sectionId);
    if (!build || !build.synctexR2Key) return null;
    const data = await loadSynctex(`${build.id}:${build.builtAt}`, build.synctexR2Key);
    if (!data) return null;
    return pickBodyLine(data, sectionFilePath(input.sectionId), {
      page: input.page,
      xPt: input.xPt,
      yPt: input.yPt,
    });
  },

  async forward(
    db: Db,
    input: { ownerUserId: string; sectionId: string; line: number },
  ): Promise<{ page: number; xPt: number; yPt: number } | null> {
    await SectionService.assertSectionOwner(db, input.ownerUserId, input.sectionId);
    const build = await LatexBuildRepo.findBySection(db, input.ownerUserId, input.sectionId);
    if (!build || !build.synctexR2Key) return null;
    const data = await loadSynctex(`${build.id}:${build.builtAt}`, build.synctexR2Key);
    if (!data) return null;
    return pickBodyPosition(data, sectionFilePath(input.sectionId), input.line);
  },
};
