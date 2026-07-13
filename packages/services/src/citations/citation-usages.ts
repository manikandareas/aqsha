import type { CitationLocator, Db, DbOrTx, NewDocumentCitationUsage } from "@aqsha/db";
import { DocumentCitationUsageRepo, WorkspaceCitationRepo } from "@aqsha/db";

/** Cluster sitasi yang di-parse dari satu inline node `citation` di blocksJson. */
export type ParsedCitationCluster = {
  nodeId: string;
  citationIds: string[];
  locator: CitationLocator;
};

type BlockNoteNode = {
  type?: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: unknown;
};

function locatorFromProps(props: Record<string, unknown>): CitationLocator {
  const pick = (key: string): string | undefined => {
    const value = props[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };
  return {
    locator: pick("locator"),
    label: pick("label"),
    prefix: pick("prefix"),
    suffix: pick("suffix"),
  };
}

function idsFromProps(props: Record<string, unknown>): string[] {
  const raw = props.citationIds;
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Ekstrak cluster sitasi dari blocksJson BlockNote (depth-first, urutan dokumen).
 * Inline content bertipe `citation` menyimpan `citationIds` (csv) + locator/affix.
 * Tahan banting terhadap JSON rusak / bentuk tak terduga → array kosong.
 */
export function extractCitationClusters(blocksJson: string | null | undefined): ParsedCitationCluster[] {
  if (!blocksJson || !blocksJson.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(blocksJson);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: ParsedCitationCluster[] = [];
  const walk = (nodes: unknown): void => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes as BlockNoteNode[]) {
      const content = node?.content;
      if (Array.isArray(content)) {
        for (const inline of content as BlockNoteNode[]) {
          if (inline?.type === "citation" && inline.props) {
            const ids = idsFromProps(inline.props);
            if (ids.length > 0) {
              const nodeId = inline.props.nodeId;
              out.push({
                nodeId: typeof nodeId === "string" ? nodeId : "",
                citationIds: ids,
                locator: locatorFromProps(inline.props),
              });
            }
          }
        }
      }
      if (Array.isArray(node?.children)) walk(node.children);
    }
  };
  walk(parsed);
  return out;
}

function hasLocatorData(locator: CitationLocator): boolean {
  return Boolean(locator.locator || locator.label || locator.prefix || locator.suffix);
}

/**
 * Rekonsiliasi document_citation_usages dari blocksJson dokumen — dipanggil dalam
 * transaksi save (`ArtifactService.updateDocument`). Hanya citationId yang benar-benar
 * ada di workspace yang dicatat (FK aman; id yang missing diabaikan — editor sudah
 * menampilkan state missing dari hasil render). Idempotent: replace-all per dokumen.
 */
export const CitationUsageService = {
  async reconcileDocument(
    db: Db | DbOrTx,
    input: {
      ownerUserId: string;
      workspaceId: string;
      documentArtifactId: string;
      blocksJson: string | null | undefined;
    },
  ): Promise<void> {
    const clusters = extractCitationClusters(input.blocksJson);
    const referencedIds = [...new Set(clusters.flatMap((c) => c.citationIds))];

    let validIds = new Set<string>();
    if (referencedIds.length > 0) {
      const rows = await WorkspaceCitationRepo.findByIds(db, input.ownerUserId, referencedIds);
      validIds = new Set(
        rows.filter((r) => r.workspaceId === input.workspaceId).map((r) => r.id),
      );
    }

    const now = Date.now();
    const rows: NewDocumentCitationUsage[] = [];
    let order = 0;
    for (const cluster of clusters) {
      for (const citationId of cluster.citationIds) {
        if (!validIds.has(citationId)) continue;
        rows.push({
          id: crypto.randomUUID(),
          ownerUserId: input.ownerUserId,
          workspaceId: input.workspaceId,
          documentArtifactId: input.documentArtifactId,
          citationId,
          inlineNodeId: cluster.nodeId || null,
          occurrenceOrder: order,
          locatorJson: hasLocatorData(cluster.locator) ? cluster.locator : null,
          createdAt: now,
          updatedAt: now,
        });
        order += 1;
      }
    }

    await DocumentCitationUsageRepo.replaceForDocument(db, {
      ownerUserId: input.ownerUserId,
      documentArtifactId: input.documentArtifactId,
      rows,
    });
  },
};
