import type { ActivityEvent } from "@aqsha/agent-contracts";
import { domainFromUrl, faviconUrl } from "@/features/explore/utils/reader-format";
import type { ResearchSource } from "../types";

// Pure presentation model for the sub-agent detail side panel (per-subagent
// scope). A sub-agent's tool children are its search steps (`searchWeb` /
// `searchArxiv`, each carrying the clamped `query` + `resultCount` scalar). The
// actual source LINKS are not tagged per sub-agent — they live on the run as
// `ResearchSource[]` keyed by `discoveryQuery` — so we re-join them here by the
// normalized query string. The join is best-effort (the tool-node query is
// clamped to ≤120 chars at the source); a clamped query falls back to a prefix
// match, and a step with no matched sources still shows its `resultCount`.

export type SubagentSourceLink = {
  key: string;
  title: string;
  url?: string;
  domain: string | null;
  favicon: string | null;
};

export type SubagentQueryGroup = {
  id: string;
  /** The agent-composed search query (clamped) — the group heading. */
  query: string;
  /** Tool label, e.g. "Selesai mencari web". */
  toolLabel: string;
  /** Result count from the tool's scalar metadata, else the matched-link count. */
  resultCount: number;
  /** Source links re-joined from the run by `discoveryQuery`. */
  links: SubagentSourceLink[];
};

export type SubagentDetailModel = {
  title: string;
  /** Terminal roll-up / running activity line, if any. */
  summary?: string;
  /** Search steps (one per tool child that carries a query). */
  groups: SubagentQueryGroup[];
  /** Total source links surfaced across all groups. */
  totalLinks: number;
};

const ELLIPSIS = "…";

/** Lowercase + trim + collapse internal whitespace for a stable join key. */
function normalizeQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** A tool-node query is clamped to ≤120 chars (trailing `…`). Match a source's
 *  raw `discoveryQuery` exactly, or by prefix when the tool query was clamped. */
function queryMatches(toolQuery: string, sourceQuery: string): boolean {
  const tool = normalizeQuery(toolQuery);
  const source = normalizeQuery(sourceQuery);
  if (tool === source) return true;
  if (toolQuery.endsWith(ELLIPSIS)) {
    return source.startsWith(normalizeQuery(toolQuery.slice(0, -1)));
  }
  return false;
}

function toLink(source: ResearchSource): SubagentSourceLink {
  const domain = source.url ? domainFromUrl(source.url) : null;
  return {
    key: source._id,
    title: source.title,
    url: source.url,
    domain: domain ?? source.provider ?? null,
    favicon: source.url ? faviconUrl(source.url) : null,
  };
}

type GroupAccumulator = {
  id: string;
  query: string;
  toolLabel: string;
  metaCounts: number[];
  links: SubagentSourceLink[];
  seen: Set<string>;
};

/**
 * Build the per-sub-agent detail model. `runSources` is the run's full source
 * list (already filtered to the sub-agent's `runId` by the caller). Pure.
 *
 * Tool children that share a normalized query are COALESCED into one group (the
 * agent often re-issues the same/near-identical search — the screenshot showed
 * the same query twice, once with 0 and once with N sources). The merged group
 * unions its source links (deduped by id + url) and reports the most honest
 * upper-bound count: the largest single-call `resultCount`, or the unique-link
 * count when that is higher.
 */
export function subagentDetailModel(
  node: ActivityEvent,
  runSources: ResearchSource[],
): SubagentDetailModel {
  const toolChildren = (node.children ?? []).filter(
    (child) =>
      child.type === "tool" && typeof child.metadata?.query === "string",
  );

  const byQuery = new Map<string, GroupAccumulator>();
  for (const child of toolChildren) {
    const query = String(child.metadata?.query ?? "");
    const key = normalizeQuery(query);
    let group = byQuery.get(key);
    if (!group) {
      group = {
        id: child.id,
        query,
        toolLabel: child.title,
        metaCounts: [],
        links: [],
        seen: new Set<string>(),
      };
      byQuery.set(key, group);
    }
    const metaCount = child.metadata?.resultCount;
    if (typeof metaCount === "number") group.metaCounts.push(metaCount);
    for (const source of runSources) {
      if (
        source.discoveryQuery == null ||
        !queryMatches(query, source.discoveryQuery)
      ) {
        continue;
      }
      const dedupeKey = source.url ?? source._id;
      if (group.seen.has(dedupeKey)) continue;
      group.seen.add(dedupeKey);
      group.links.push(toLink(source));
    }
  }

  const groups: SubagentQueryGroup[] = [...byQuery.values()].map((group) => ({
    id: group.id,
    query: group.query,
    toolLabel: group.toolLabel,
    resultCount: Math.max(0, ...group.metaCounts, group.links.length),
    links: group.links,
  }));

  return {
    title: node.title,
    summary: node.summary,
    groups,
    totalLinks: groups.reduce((sum, group) => sum + group.links.length, 0),
  };
}

/** Walk a run's activity tree to find a sub-agent node by id. Pure. */
export function findSubagentNode(
  nodes: ActivityEvent[],
  subagentId: string,
): ActivityEvent | undefined {
  for (const node of nodes) {
    if (node.id === subagentId) return node;
    if (node.children?.length) {
      const inner = findSubagentNode(node.children, subagentId);
      if (inner) return inner;
    }
  }
  return undefined;
}
