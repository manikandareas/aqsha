import { throwAppError } from "@aqsha/db";
import type {
  LiteratureFilterCategoryId,
  LiteratureFilterClause,
  LiteratureFilterDefinition,
  LiteratureFilterId,
  LiteratureFilterKind,
  LiteratureFilterValue,
  LiteratureSearchInput,
  LiteratureSortId,
  NormalizedLiteratureSearch,
  PublicLiteratureCatalog,
} from "./types";
import { LITERATURE_SORT_IDS } from "./types";

const MAX_FILTER_CLAUSES = 30;
const MAX_VALUES_PER_CLAUSE = 25;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const DEFAULT_RETRACTION: LiteratureFilterClause = { id: "retraction", value: "exclude" };

type FilterMapper = (value: LiteratureFilterValue) => string[];

type InternalFilterEntry = LiteratureFilterDefinition & {
  mapToOpenAlex: FilterMapper;
};

const CATEGORIES: Array<{ id: LiteratureFilterCategoryId; label: string }> = [
  { id: "publication", label: "Publikasi" },
  { id: "access", label: "Akses" },
  { id: "impact", label: "Dampak" },
  { id: "authorship", label: "Penulis & afiliasi" },
  { id: "research", label: "Riset" },
  { id: "funding", label: "Pendanaan & keterhubungan" },
  { id: "integrity", label: "Integritas" },
];

const SORT_LABELS: Record<LiteratureSortId, string> = {
  relevance: "Relevansi",
  publication_date_desc: "Terbaru",
  publication_date_asc: "Terlama",
  citations_desc: "Sitasi terbanyak",
  fwci_desc: "FWCI tertinggi",
  authors_desc: "Jumlah penulis",
  references_desc: "Jumlah referensi",
};

function asString(value: LiteratureFilterValue): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asBoolean(value: LiteratureFilterValue): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asStringList(value: LiteratureFilterValue): string[] | null {
  if (typeof value === "string" && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return null;
  const items = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : null;
}

function asRange(
  value: LiteratureFilterValue,
): { min?: string | number; max?: string | number } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const range = value as { min?: unknown; max?: unknown };
  const min =
    typeof range.min === "string" || typeof range.min === "number" ? range.min : undefined;
  const max =
    typeof range.max === "string" || typeof range.max === "number" ? range.max : undefined;
  if (min === undefined && max === undefined) return null;
  return { min, max };
}

function mapBoolean(path: string): FilterMapper {
  return (value) => {
    const bool = asBoolean(value);
    if (bool === null) throwInvalidFilter();
    return [`${path}:${bool ? "true" : "false"}`];
  };
}

function mapExact(path: string): FilterMapper {
  return (value) => {
    const text = asString(value);
    if (!text) throwInvalidFilter();
    return [`${path}:${text}`];
  };
}

function mapMulti(path: string): FilterMapper {
  return (value) => {
    const items = asStringList(value);
    if (!items) throwInvalidFilter();
    if (items.length > MAX_VALUES_PER_CLAUSE) throwInvalidFilter();
    return [`${path}:${items.join("|")}`];
  };
}

function mapDateRange(fromPath: string, toPath: string): FilterMapper {
  return (value) => {
    const range = asRange(value);
    if (!range) throwInvalidFilter();
    const parts: string[] = [];
    if (range.min !== undefined) {
      const min = String(range.min);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(min)) throwInvalidFilter();
      parts.push(`${fromPath}:${min}`);
    }
    if (range.max !== undefined) {
      const max = String(range.max);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(max)) throwInvalidFilter();
      parts.push(`${toPath}:${max}`);
    }
    return parts;
  };
}

function mapNumberRange(path: string, opts?: { exclusiveMin?: boolean }): FilterMapper {
  return (value) => {
    const range = asRange(value);
    if (!range) throwInvalidFilter();
    const min =
      range.min === undefined
        ? undefined
        : typeof range.min === "number"
          ? range.min
          : Number(range.min);
    const max =
      range.max === undefined
        ? undefined
        : typeof range.max === "number"
          ? range.max
          : Number(range.max);
    if ((min !== undefined && !Number.isFinite(min)) || (max !== undefined && !Number.isFinite(max))) {
      throwInvalidFilter();
    }
    if (min !== undefined && max !== undefined) {
      return [`${path}:${min}-${max}`];
    }
    if (min !== undefined) {
      if (opts?.exclusiveMin) {
        return [`${path}:>${Math.trunc(min) - 1}`];
      }
      return [`${path}:>=${min}`];
    }
    return [`${path}:<=${max}`];
  };
}

function mapRetraction(): FilterMapper {
  return (value) => {
    const mode = asString(value);
    if (mode === "exclude") return ["is_retracted:false"];
    if (mode === "only") return ["is_retracted:true"];
    if (mode === "include") return [];
    throwInvalidFilter();
  };
}

function throwInvalidFilter(): never {
  throwAppError({
    message: "Filter tidak valid (literature_filter_invalid).",
    code: "literature_filter_invalid",
    field: "filters",
  });
}

function entry(
  id: LiteratureFilterId,
  category: LiteratureFilterCategoryId,
  label: string,
  kind: LiteratureFilterKind,
  mapToOpenAlex: FilterMapper,
  extra?: Partial<Pick<LiteratureFilterDefinition, "entityKind" | "options">>,
): InternalFilterEntry {
  return { id, category, label, kind, mapToOpenAlex, ...extra };
}

const LITERATURE_FILTERS: InternalFilterEntry[] = [
  entry("publication_date", "publication", "Tanggal publikasi", "date-range", mapDateRange("from_publication_date", "to_publication_date")),
  entry("work_type", "publication", "Jenis karya", "multi-select", mapMulti("type"), {
    options: [
      { value: "article", label: "Artikel" },
      { value: "review", label: "Review" },
      { value: "preprint", label: "Preprint" },
      { value: "book-chapter", label: "Bab buku" },
      { value: "dissertation", label: "Disertasi" },
      { value: "dataset", label: "Dataset" },
    ],
  }),
  entry("language", "publication", "Bahasa", "multi-select", mapMulti("language")),
  entry("venue", "publication", "Jurnal / sumber", "entity", mapMulti("primary_location.source.id"), {
    entityKind: "sources",
  }),
  entry("issn", "publication", "ISSN", "text", mapExact("primary_location.source.issn")),
  entry("publisher", "publication", "Penerbit", "entity", mapMulti("primary_location.source.host_organization"), {
    entityKind: "publishers",
  }),
  entry("indexed_in", "publication", "Terindeks di", "multi-select", mapMulti("indexed_in")),

  entry("open_access", "access", "Open access", "toggle", mapBoolean("open_access.is_oa")),
  entry("oa_status", "access", "Status OA", "multi-select", mapMulti("open_access.oa_status"), {
    options: [
      { value: "gold", label: "Gold" },
      { value: "hybrid", label: "Hybrid" },
      { value: "bronze", label: "Bronze" },
      { value: "green", label: "Green" },
      { value: "diamond", label: "Diamond" },
    ],
  }),
  entry("has_pdf", "access", "Ada PDF", "toggle", mapBoolean("has_pdf_url")),
  entry("has_fulltext", "access", "Ada full text", "toggle", mapBoolean("has_fulltext")),
  entry("open_version", "access", "Versi terbuka", "select", mapExact("best_open_version"), {
    options: [
      { value: "acceptedOrPublished", label: "Accepted / published" },
      { value: "published", label: "Published" },
      { value: "any", label: "Semua versi" },
    ],
  }),
  entry("repository_fulltext", "access", "Full text di repositori", "toggle", mapBoolean("open_access.any_repository_has_fulltext")),
  entry("license", "access", "Lisensi", "multi-select", mapMulti("best_oa_location.license")),
  entry("doaj", "access", "Di DOAJ", "toggle", mapBoolean("primary_location.source.is_in_doaj")),
  entry("core_source", "access", "Sumber core", "toggle", mapBoolean("primary_location.source.is_core")),
  entry("apc_list_usd", "access", "APC daftar (USD)", "number-range", mapNumberRange("apc_list.value_usd")),
  entry("apc_paid_usd", "access", "APC dibayar (USD)", "number-range", mapNumberRange("apc_paid.value_usd")),
  entry("apc_currency", "access", "Mata uang APC", "text", mapExact("apc_list.currency")),

  entry("citation_count", "impact", "Jumlah sitasi", "number-range", mapNumberRange("cited_by_count", { exclusiveMin: true })),
  entry("fwci", "impact", "FWCI", "number-range", mapNumberRange("fwci")),
  entry("citation_top_10", "impact", "Top 10% sitasi", "toggle", mapBoolean("citation_normalized_percentile.is_in_top_10_percent")),
  entry("citation_top_1", "impact", "Top 1% sitasi", "toggle", mapBoolean("citation_normalized_percentile.is_in_top_1_percent")),
  entry("authors_count", "impact", "Jumlah penulis", "number-range", mapNumberRange("authors_count")),
  entry("references_count", "impact", "Jumlah referensi", "number-range", mapNumberRange("referenced_works_count")),

  entry("author", "authorship", "Penulis", "entity", mapMulti("authorships.author.id"), { entityKind: "authors" }),
  entry("author_orcid", "authorship", "ORCID penulis", "text", mapExact("authorships.author.orcid")),
  entry("corresponding_author", "authorship", "Corresponding author", "entity", mapMulti("corresponding_author_ids"), {
    entityKind: "authors",
  }),
  entry("institution", "authorship", "Institusi", "entity", mapMulti("institutions.id"), {
    entityKind: "institutions",
  }),
  entry("institution_type", "authorship", "Tipe institusi", "multi-select", mapMulti("institutions.type")),
  entry("institution_country", "authorship", "Negara institusi", "multi-select", mapMulti("institutions.country_code")),
  entry("institution_continent", "authorship", "Benua institusi", "multi-select", mapMulti("institutions.continent")),
  entry("institution_global_south", "authorship", "Global South", "toggle", mapBoolean("institutions.is_global_south")),

  entry("topic", "research", "Topik", "entity", mapMulti("topics.id"), { entityKind: "topics" }),
  entry("subfield", "research", "Subfield", "entity", mapMulti("topics.subfield.id"), { entityKind: "topics" }),
  entry("field", "research", "Field", "entity", mapMulti("topics.field.id"), { entityKind: "topics" }),
  entry("domain", "research", "Domain", "entity", mapMulti("topics.domain.id"), { entityKind: "topics" }),
  entry("concept", "research", "Konsep", "entity", mapMulti("concepts.id"), { entityKind: "concepts" }),
  entry("keyword", "research", "Kata kunci", "entity", mapMulti("keywords.id"), { entityKind: "keywords" }),
  entry("sdg", "research", "SDG", "multi-select", mapMulti("sustainable_development_goals.id")),

  entry("funder", "funding", "Funder", "entity", mapMulti("funders.id"), { entityKind: "funders" }),
  entry("award", "funding", "Award", "text", mapExact("awards.id")),
  entry("cites", "funding", "Mengutip karya", "entity", mapExact("cites"), { entityKind: "works" }),
  entry("cited_by", "funding", "Dikutip oleh", "entity", mapExact("cited_by"), { entityKind: "works" }),
  entry("related_to", "funding", "Terkait dengan", "entity", mapExact("related_to"), { entityKind: "works" }),

  entry("has_abstract", "integrity", "Ada abstrak", "toggle", mapBoolean("has_abstract")),
  entry("has_doi", "integrity", "Ada DOI", "toggle", mapBoolean("has_doi")),
  entry("has_references", "integrity", "Ada referensi", "toggle", mapBoolean("has_references")),
  entry("retraction", "integrity", "Retraction", "select", mapRetraction(), {
    options: [
      { value: "exclude", label: "Kecualikan retracted" },
      { value: "only", label: "Hanya retracted" },
      { value: "include", label: "Sertakan retracted" },
    ],
  }),
];

const FILTER_BY_ID = new Map(LITERATURE_FILTERS.map((filter) => [filter.id, filter]));

export function isLiteratureSortId(value: unknown): value is LiteratureSortId {
  return typeof value === "string" && (LITERATURE_SORT_IDS as readonly string[]).includes(value);
}

export function isLiteratureFilterId(value: unknown): value is LiteratureFilterId {
  return typeof value === "string" && FILTER_BY_ID.has(value as LiteratureFilterId);
}

function clampLiteratureLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit)));
}

function normalizeClauseValue(
  filter: InternalFilterEntry,
  value: LiteratureFilterValue,
): LiteratureFilterValue {
  // Run mapper for validation only; keep the user-facing value shape.
  filter.mapToOpenAlex(value);

  if (filter.kind === "multi-select" || filter.kind === "entity") {
    const items = asStringList(value);
    if (!items || items.length > MAX_VALUES_PER_CLAUSE) throwInvalidFilter();
    return items.length === 1 && typeof value === "string" ? items[0]! : items;
  }

  if (filter.kind === "toggle") {
    const bool = asBoolean(value);
    if (bool === null) throwInvalidFilter();
    return bool;
  }

  if (filter.kind === "date-range" || filter.kind === "number-range") {
    const range = asRange(value);
    if (!range) throwInvalidFilter();
    return range;
  }

  const text = asString(value);
  if (!text) throwInvalidFilter();
  return text;
}

function normalizeClauses(raw: LiteratureFilterClause[]): LiteratureFilterClause[] {
  if (raw.length > MAX_FILTER_CLAUSES) throwInvalidFilter();

  const normalized: LiteratureFilterClause[] = [];
  for (const clause of raw) {
    if (!clause || typeof clause !== "object") throwInvalidFilter();
    if (!isLiteratureFilterId(clause.id)) throwInvalidFilter();
    const filter = FILTER_BY_ID.get(clause.id);
    if (!filter) throwInvalidFilter();
    normalized.push({
      id: clause.id,
      value: normalizeClauseValue(filter, clause.value),
    });
  }
  return normalized;
}

export function normalizeLiteratureSearch(
  input: LiteratureSearchInput,
): NormalizedLiteratureSearch {
  const query = input.query.trim().replace(/\s+/g, " ");
  if (!query) {
    throwAppError({
      message: "Kata kunci wajib diisi.",
      code: "literature_query_required",
      field: "query",
    });
  }
  if (query.length > 500) {
    throwAppError({
      message: "Kata kunci terlalu panjang.",
      code: "literature_query_too_long",
      field: "query",
    });
  }

  const filters = normalizeClauses(input.filters ?? []);
  if (!filters.some((filter) => filter.id === "retraction")) {
    filters.push(DEFAULT_RETRACTION);
  }

  return {
    query,
    sort: isLiteratureSortId(input.sort) ? input.sort : "relevance",
    filters,
    cursor: input.cursor ?? null,
    limit: clampLiteratureLimit(input.limit),
  };
}

export function toOpenAlexFilter(filters: LiteratureFilterClause[]): string {
  const parts: string[] = [];
  for (const clause of filters) {
    const filter = FILTER_BY_ID.get(clause.id);
    if (!filter) throwInvalidFilter();
    parts.push(...filter.mapToOpenAlex(clause.value));
  }
  if (!parts.includes("is_paratext:false")) {
    parts.push("is_paratext:false");
  }
  return parts.join(",");
}

export function publicLiteratureCatalog(): PublicLiteratureCatalog {
  return {
    categories: CATEGORIES.map((category) => ({ ...category })),
    filters: LITERATURE_FILTERS.map(({ mapToOpenAlex: _mapper, ...rest }) => ({ ...rest })),
    sorts: LITERATURE_SORT_IDS.map((id) => ({ id, label: SORT_LABELS[id] })),
  };
}

export function literatureFilterIds(): LiteratureFilterId[] {
  return LITERATURE_FILTERS.map((filter) => filter.id);
}
