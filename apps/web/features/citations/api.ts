"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useApi } from "@/lib/api-client";
import { readableApiErrorMessage } from "@/lib/api-error";
import { queryKeys, unwrap } from "@/lib/api-query";
import type {
  BibliographySort,
  CitationDetail,
  CitationDuplicateGroup,
  CitationListResponse,
  CitationRenderResult,
  CitationSettings,
  CitationStyleId,
  CreateFromArtifactResult,
  DocumentCitationCluster,
  DocumentRenderResult,
  ImportCommitResult,
  ImportDuplicatePolicy,
  ImportPreviewResult,
  ManualCitationFields,
  ProviderFolder,
} from "./types";

const LIST_PAGE_SIZE = 50;

export type CitationListFilters = {
  q: string;
  status: "verified" | "needs_review" | "incomplete" | null;
  source: "import" | "provider_sync" | "artifact" | "doi" | "manual" | null;
  tag: string | null;
};

export const EMPTY_CITATION_FILTERS: CitationListFilters = {
  q: "",
  status: null,
  source: null,
  tag: null,
};

/** List referensi workspace (infinite/keyset) + `total` untuk count toolbar. */
export function useCitationsList(workspaceId: string, filters: CitationListFilters) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: queryKeys.citations.list(workspaceId, filters),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      unwrap(
        await api.workspaces({ id: workspaceId }).citations.get({
          query: {
            limit: LIST_PAGE_SIZE,
            ...(pageParam ? { cursor: pageParam } : {}),
            ...(filters.q ? { q: filters.q } : {}),
            ...(filters.status ? { status: filters.status } : {}),
            ...(filters.source ? { source: filters.source } : {}),
            ...(filters.tag ? { tag: filters.tag } : {}),
          },
        }),
      ) as CitationListResponse,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useCitationTags(workspaceId: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.citations.tags(workspaceId),
    queryFn: async () =>
      unwrap(await api.workspaces({ id: workspaceId }).citations.tags.get()) as string[],
  });
}

export function useCitationDetail(workspaceId: string, citationId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.citations.detail(workspaceId, citationId ?? ""),
    enabled: Boolean(citationId),
    queryFn: async () =>
      unwrap(
        await api
          .workspaces({ id: workspaceId })
          .citations({ citationId: citationId ?? "" })
          .get(),
      ) as CitationDetail,
  });
}

function useInvalidateCitations(workspaceId: string) {
  const qc = useQueryClient();
  return () =>
    qc.invalidateQueries({ queryKey: queryKeys.citations.workspace(workspaceId) });
}

/** Create manual (fields) ATAU by-DOI (doi) — satu endpoint POST. */
export function useCreateCitation(workspaceId: string) {
  const api = useApi();
  const invalidate = useInvalidateCitations(workspaceId);
  return useMutation({
    mutationFn: async (input: {
      doi?: string;
      fields?: ManualCitationFields;
      tags?: string[];
      allowDuplicate?: boolean;
    }) =>
      unwrap(await api.workspaces({ id: workspaceId }).citations.post(input)) as CitationDetail,
    onSuccess: () => invalidate(),
  });
}

export function useUpdateCitation(workspaceId: string) {
  const api = useApi();
  const invalidate = useInvalidateCitations(workspaceId);
  return useMutation({
    mutationFn: async (input: {
      citationId: string;
      fields?: ManualCitationFields;
      tags?: string[];
      artifactId?: string | null;
      markReviewed?: boolean;
    }) =>
      unwrap(
        await api
          .workspaces({ id: workspaceId })
          .citations({ citationId: input.citationId })
          .patch({
            fields: input.fields,
            tags: input.tags,
            artifactId: input.artifactId,
            markReviewed: input.markReviewed,
          }),
      ) as CitationDetail,
    onSuccess: () => invalidate(),
    onError: (error) => toast.error(readableApiErrorMessage(error, "Gagal menyimpan referensi")),
  });
}

export function useDeleteCitation(workspaceId: string) {
  const api = useApi();
  const invalidate = useInvalidateCitations(workspaceId);
  return useMutation({
    mutationFn: async (citationId: string) =>
      unwrap(
        await api.workspaces({ id: workspaceId }).citations({ citationId }).delete(),
      ) as { ok: true },
    onSuccess: () => {
      invalidate();
      toast.success("Referensi dihapus");
    },
    onError: (error) => toast.error(readableApiErrorMessage(error, "Gagal menghapus referensi")),
  });
}

export function useMergeCitations(workspaceId: string) {
  const api = useApi();
  const invalidate = useInvalidateCitations(workspaceId);
  return useMutation({
    mutationFn: async (input: { sourceId: string; targetId: string }) =>
      unwrap(
        await api.workspaces({ id: workspaceId }).citations.duplicates.merge.post(input),
      ) as CitationDetail,
    onSuccess: () => {
      invalidate();
      toast.success("Referensi digabungkan");
    },
    onError: (error) => toast.error(readableApiErrorMessage(error, "Gagal menggabungkan referensi")),
  });
}

/** Grup kandidat duplikat workspace (dialog "Kelola duplikat"). */
export function useDuplicateGroups(workspaceId: string, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.citations.duplicates(workspaceId),
    enabled,
    queryFn: async () =>
      unwrap(
        await api.workspaces({ id: workspaceId }).citations.duplicates.get(),
      ) as CitationDuplicateGroup[],
  });
}

/** Merge banyak referensi (bulk bar / kelola duplikat) — target opsional. */
export function useMergeManyCitations(workspaceId: string) {
  const api = useApi();
  const invalidate = useInvalidateCitations(workspaceId);
  return useMutation({
    mutationFn: async (input: { ids: string[]; targetId?: string }) =>
      unwrap(
        await api.workspaces({ id: workspaceId }).citations.merge.post(input),
      ) as CitationDetail,
    onSuccess: () => {
      invalidate();
      toast.success("Referensi digabungkan");
    },
    onError: (error) => toast.error(readableApiErrorMessage(error, "Gagal menggabungkan referensi")),
  });
}

/** Tambah tag ke banyak referensi terpilih. */
export function useBulkTagCitations(workspaceId: string) {
  const api = useApi();
  const invalidate = useInvalidateCitations(workspaceId);
  return useMutation({
    mutationFn: async (input: { ids: string[]; tags: string[] }) =>
      unwrap(
        await api.workspaces({ id: workspaceId }).citations["bulk-tag"].post(input),
      ) as { affected: number },
    onSuccess: (result) => {
      invalidate();
      toast.success(`${result.affected} referensi diberi tag`);
    },
    onError: (error) => toast.error(readableApiErrorMessage(error, "Gagal memberi tag")),
  });
}

/** Hapus (soft delete) banyak referensi terpilih. */
export function useBulkDeleteCitations(workspaceId: string) {
  const api = useApi();
  const invalidate = useInvalidateCitations(workspaceId);
  return useMutation({
    mutationFn: async (ids: string[]) =>
      unwrap(
        await api.workspaces({ id: workspaceId }).citations["bulk-delete"].post({ ids }),
      ) as { affected: number },
    onSuccess: (result) => {
      invalidate();
      toast.success(`${result.affected} referensi dihapus`);
    },
    onError: (error) => toast.error(readableApiErrorMessage(error, "Gagal menghapus referensi")),
  });
}

/** "Tambahkan ke Sitasi" dari artifact paper (Fase 2 bridge). */
export function useCreateCitationFromArtifact(workspaceId: string) {
  const api = useApi();
  const invalidate = useInvalidateCitations(workspaceId);
  return useMutation({
    mutationFn: async (input: { artifactId: string; tags?: string[] }) =>
      unwrap(
        await api.workspaces({ id: workspaceId }).citations["from-artifact"].post(input),
      ) as CreateFromArtifactResult,
    onSuccess: () => invalidate(),
    onError: (error) =>
      toast.error(readableApiErrorMessage(error, "Gagal menambahkan ke Sitasi")),
  });
}

/** Perbarui metadata referensi dari DOI-nya (quality workflow Fase 2). */
export function useResolveCitation(workspaceId: string) {
  const api = useApi();
  const invalidate = useInvalidateCitations(workspaceId);
  return useMutation({
    mutationFn: async (citationId: string) =>
      unwrap(
        await api.workspaces({ id: workspaceId }).citations({ citationId }).resolve.post(),
      ) as CitationDetail,
    onSuccess: () => {
      invalidate();
      toast.success("Metadata diperbarui dari DOI");
    },
    onError: (error) => toast.error(readableApiErrorMessage(error, "Gagal memperbarui metadata")),
  });
}

export function useImportPreview(workspaceId: string) {
  const api = useApi();
  return useMutation({
    mutationFn: async (file: File) =>
      unwrap(
        await api.workspaces({ id: workspaceId }).citations.imports.preview.post({ file }),
      ) as ImportPreviewResult,
  });
}

export function useImportCommit(workspaceId: string) {
  const api = useApi();
  const invalidate = useInvalidateCitations(workspaceId);
  return useMutation({
    mutationFn: async (input: {
      batchId: string;
      selectedIndexes: number[];
      duplicatePolicy: ImportDuplicatePolicy;
    }) =>
      unwrap(
        await api
          .workspaces({ id: workspaceId })
          .citations.imports({ batchId: input.batchId })
          .commit.post({
            selectedIndexes: input.selectedIndexes,
            duplicatePolicy: input.duplicatePolicy,
          }),
      ) as ImportCommitResult,
    onSuccess: () => invalidate(),
  });
}

type IntegrationProviderKey = "mendeley" | "zotero";

/** Folder/collection provider untuk picker penarikan (Fase 5). Account-level. */
export function useProviderFolders(
  provider: IntegrationProviderKey,
  enabled = true,
) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.integrations.folders(provider),
    enabled,
    queryFn: async () =>
      unwrap(await api.integrations({ provider }).folders.get()) as ProviderFolder[],
  });
}

/** Preview penarikan folder provider → reuse UI wizard import (Fase 5). */
export function useProviderSyncPreview(workspaceId: string, provider: IntegrationProviderKey) {
  const api = useApi();
  return useMutation({
    mutationFn: async (input: { folderId: string | null }) =>
      unwrap(
        await api.integrations({ provider }).sync.preview.post({
          workspaceId,
          folderId: input.folderId,
        }),
      ) as ImportPreviewResult,
  });
}

/** Commit hasil sync provider — reuse pipeline commit import (Fase 5). */
export function useProviderSyncCommit(workspaceId: string, provider: IntegrationProviderKey) {
  const api = useApi();
  const invalidate = useInvalidateCitations(workspaceId);
  return useMutation({
    mutationFn: async (input: {
      batchId: string;
      selectedIndexes: number[];
      duplicatePolicy: ImportDuplicatePolicy;
    }) =>
      unwrap(
        await api
          .integrations({ provider })
          .sync({ batchId: input.batchId })
          .commit.post({
            workspaceId,
            selectedIndexes: input.selectedIndexes,
            duplicatePolicy: input.duplicatePolicy,
          }),
      ) as ImportCommitResult,
    onSuccess: () => invalidate(),
  });
}

/** Render preview terformat (per-entry + bibliography) — dipakai detail + "Salin sitasi". */
export function useCitationRender(
  workspaceId: string,
  params: { styleId: CitationStyleId | null; ids: string[] },
  enabled = true,
) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.citations.render(workspaceId, params),
    enabled: enabled && params.ids.length > 0,
    queryFn: async () =>
      unwrap(
        await api.workspaces({ id: workspaceId }).citations.render.post({
          ...(params.styleId ? { styleId: params.styleId } : {}),
          citationIds: params.ids,
        }),
      ) as CitationRenderResult,
  });
}

/**
 * Render sitasi in-text seluruh dokumen + bibliography used-in-document (Fase 3).
 * Keyed pada signature stabil dari `{ styleId, clusters }` supaya hanya refetch saat
 * himpunan sitasi/locator berubah, bukan tiap keystroke. `placeholderData` menahan
 * hasil lama agar marker tak berkedip saat mengetik.
 */
export function useRenderDocumentCitations(
  workspaceId: string,
  clusters: DocumentCitationCluster[],
  styleId: CitationStyleId | null,
  enabled = true,
) {
  const api = useApi();
  const signature = JSON.stringify({ styleId, clusters });
  return useQuery({
    queryKey: queryKeys.citations.renderDocument(workspaceId, signature),
    enabled: enabled && Boolean(workspaceId),
    placeholderData: (prev) => prev,
    queryFn: async () =>
      unwrap(
        await api.workspaces({ id: workspaceId }).citations["render-document"].post({
          ...(styleId ? { styleId } : {}),
          clusters,
        }),
      ) as DocumentRenderResult,
  });
}

/** "Salin sitasi": render satu referensi pada style default lalu salin ke clipboard. */
export function useCopyCitation(workspaceId: string) {
  const api = useApi();
  return useMutation({
    mutationFn: async (citationId: string) => {
      const result = unwrap(
        await api.workspaces({ id: workspaceId }).citations.render.post({
          citationIds: [citationId],
        }),
      ) as CitationRenderResult;
      const text = result.entries[0]?.text;
      if (!text) throw new Error("render kosong");
      await navigator.clipboard.writeText(text);
    },
    onSuccess: () => toast.success("Sitasi disalin"),
    onError: (error) => toast.error(readableApiErrorMessage(error, "Gagal menyalin sitasi")),
  });
}

export function useCitationSettings(workspaceId: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.citations.settings(workspaceId),
    queryFn: async () =>
      unwrap(
        await api.workspaces({ id: workspaceId })["citation-settings"].get(),
      ) as CitationSettings,
  });
}

export function useUpdateCitationSettings(workspaceId: string) {
  const api = useApi();
  const invalidate = useInvalidateCitations(workspaceId);
  return useMutation({
    mutationFn: async (input: {
      defaultStyleId?: CitationStyleId;
      bibliographySort?: BibliographySort;
    }) =>
      unwrap(
        await api.workspaces({ id: workspaceId })["citation-settings"].patch(input),
      ) as CitationSettings,
    onSuccess: () => {
      // Style default berubah → semua render preview ikut basi, bukan hanya settings.
      invalidate();
      toast.success("Pengaturan sitasi disimpan");
    },
    onError: (error) => toast.error(readableApiErrorMessage(error, "Gagal menyimpan pengaturan")),
  });
}

/** Unduh export (bibtex/ris/csl-json) sebagai file — semua atau id terpilih. */
export function useExportCitations(workspaceId: string) {
  const api = useApi();
  return useMutation({
    mutationFn: async (input: { format: "bibtex" | "ris" | "csl-json"; ids?: string[] }) => {
      // Route mengembalikan Response text (content-disposition) — Eden bisa memberi
      // string (sudah diparse) atau Response tergantung content-type.
      const data = unwrap(
        await api.workspaces({ id: workspaceId }).citations.export.get({
          query: {
            format: input.format,
            ...(input.ids?.length ? { ids: input.ids.join(",") } : {}),
          },
        }),
      ) as unknown;
      const content =
        typeof data === "string" ? data : await (data as Response).text();
      const extension =
        input.format === "bibtex" ? "bib" : input.format === "ris" ? "ris" : "json";
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `sitasi.${extension}`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
    onError: (error) => toast.error(readableApiErrorMessage(error, "Gagal mengekspor referensi")),
  });
}
