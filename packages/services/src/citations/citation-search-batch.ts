import type { Db } from "@aqsha/db";
import { AppError, throwAppError } from "@aqsha/db";
import { citationCrudMethods } from "./citation-crud.methods";
import { exportCitations, type CitationExportFormat } from "./citation-format";
import {
  buildCslFromManualInput,
  type ManualCitationInput,
} from "./citation-normalize";

const MAX_SAVE_SOURCES = 50;
const MAX_EXPORT_SOURCES = 100;
const SAVE_CONCURRENCY = 5;

export type SearchSourceInput = {
  clientKey: string;
  title: string;
  doi?: string | null;
  url?: string | null;
  authors?: string[];
  year?: number | null;
  venue?: string | null;
  documentType?: string | null;
};

export type BulkSearchSaveItem = {
  clientKey: string;
  status: "saved" | "failed";
  citationId?: string;
  created?: boolean;
  code?: string;
  message?: string;
};

export type BulkSearchSaveResult = {
  saved: number;
  failed: number;
  items: BulkSearchSaveItem[];
};

export type SearchSourceExportResult = {
  content: string;
  mimeType: string;
  filename: string;
};

const EXPORT_FORMATS = new Set<CitationExportFormat>(["bibtex", "ris", "csl-json"]);

function toManualFields(source: SearchSourceInput): ManualCitationInput {
  return {
    documentType: source.documentType ?? undefined,
    title: source.title,
    authors: (source.authors ?? [])
      .map((name) => name.trim())
      .filter(Boolean)
      .map((literal) => ({ literal })),
    publishedYear: source.year ?? null,
    venue: source.venue ?? null,
    doi: source.doi ?? null,
    url: source.url ?? null,
  };
}

function errorItem(clientKey: string, error: unknown): BulkSearchSaveItem {
  if (error instanceof AppError) {
    return {
      clientKey,
      status: "failed",
      code: error.code,
      message: error.message,
    };
  }
  return {
    clientKey,
    status: "failed",
    code: "citation_save_failed",
    message: error instanceof Error ? error.message : "Gagal menyimpan sumber.",
  };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run()),
  );
  return results;
}

export const citationSearchBatchMethods = {
  async saveSearchSources(
    db: Db,
    input: { ownerUserId: string; sources: SearchSourceInput[] },
  ): Promise<BulkSearchSaveResult> {
    if (input.sources.length > MAX_SAVE_SOURCES) {
      throwAppError({
        message: "Maksimal 50 sumber per permintaan.",
        code: "citation_batch_too_large",
        field: "sources",
      });
    }

    const items = await mapPool(input.sources, SAVE_CONCURRENCY, async (source) => {
      try {
        const doi = source.doi?.trim();
        const saved = doi
          ? await citationCrudMethods.createByDoi(db, {
              ownerUserId: input.ownerUserId,
              doi,
              onDuplicate: "return-existing",
            })
          : await citationCrudMethods.createManual(db, {
              ownerUserId: input.ownerUserId,
              fields: toManualFields(source),
              onDuplicate: "return-existing",
            });
        return {
          clientKey: source.clientKey,
          status: "saved" as const,
          citationId: saved.id,
          created: saved.created,
        };
      } catch (error) {
        return errorItem(source.clientKey, error);
      }
    });

    return {
      saved: items.filter((item) => item.status === "saved").length,
      failed: items.filter((item) => item.status === "failed").length,
      items,
    };
  },

  exportSearchSources(input: {
    sources: SearchSourceInput[];
    format: CitationExportFormat;
  }): SearchSourceExportResult {
    if (!EXPORT_FORMATS.has(input.format)) {
      throwAppError({
        message: "Format export tidak didukung.",
        code: "citation_export_format_invalid",
        field: "format",
      });
    }
    if (input.sources.length > MAX_EXPORT_SOURCES) {
      throwAppError({
        message: "Maksimal 100 sumber per export.",
        code: "citation_batch_too_large",
        field: "sources",
      });
    }

    const cslItems = input.sources.map((source) => buildCslFromManualInput(toManualFields(source)));
    const exported = exportCitations(cslItems, input.format);
    return {
      content: exported.content,
      mimeType: exported.mimeType,
      filename: `selected-papers.${exported.extension}`,
    };
  },
};
