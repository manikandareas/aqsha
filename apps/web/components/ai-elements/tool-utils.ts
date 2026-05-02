export type ToolSummaryField = { label: string; value: string };

export function toolDisplayName(value: string, options?: { pluralSource?: boolean }) {
  const label = readableToolName(value);
  const normalized = normalizedToolName(label);

  if (normalized.includes("load skill")) return "Prepared a research path";
  if (normalized.includes("read skill resource")) return "Read the research guide";
  if (normalized.includes("web search") || normalized.includes("exa")) {
    return "Looked for source context";
  }
  if (normalized.includes("fetch") || normalized.includes("read url")) {
    return options?.pluralSource ? "Opened sources" : "Opened a source";
  }
  if (normalized.includes("search")) return "Searched for sources";

  return label.replace(/^./, (letter) => letter.toUpperCase());
}

export function readableToolName(value: string) {
  return value
    .replace(/^tool-/, "")
    .replaceAll("_", " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizedToolName(value: string) {
  return readableToolName(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function valueRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function summaryValue(value: unknown, maxLength = 180): string | null {
  if (typeof value === "string") {
    return value.length > maxLength ? `${value.slice(0, maxLength).trim()}...` : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const firstRecord = valueRecord(value[0]);
    const firstTitle = summaryValue(firstRecord?.title ?? firstRecord?.name ?? firstRecord?.url, maxLength);

    return firstTitle
      ? `${value.length} item${value.length === 1 ? "" : "s"}: ${firstTitle}`
      : `${value.length} item${value.length === 1 ? "" : "s"}`;
  }

  if (value && typeof value === "object") {
    return "Context received";
  }

  return null;
}

export function summaryFields(value: unknown, options?: { maxLength?: number; primitiveLabel?: string }): ToolSummaryField[] {
  const maxLength = options?.maxLength ?? 180;

  if (Array.isArray(value)) {
    const firstRecord = valueRecord(value[0]);
    const fields = [
      ["Items", value.length],
      ["Source", firstRecord?.title ?? firstRecord?.name ?? firstRecord?.url],
      ["Note", firstRecord?.description ?? firstRecord?.summary ?? firstRecord?.content],
    ]
      .map(([label, rawValue]) => ({
        label: label as string,
        value: summaryValue(rawValue, maxLength),
      }))
      .filter((field): field is ToolSummaryField => Boolean(field.value));

    return fields.length > 0
      ? fields
      : [{ label: "Items", value: summaryValue(value, maxLength) ?? "0 items" }];
  }

  const record = valueRecord(value);

  if (!record) {
    const text = summaryValue(value, maxLength);
    return text ? [{ label: options?.primitiveLabel ?? "Detail", value: text }] : [];
  }

  const fields = [
    ["Question", record.query ?? record.q ?? record.searchQuery ?? record.search_query],
    ["Source", record.title ?? record.name ?? record.url],
    ["Note", record.description ?? record.summary ?? record.content],
    ["Items", record.totalResults ?? record.total_results ?? record.count ?? record.results],
  ]
    .map(([label, rawValue]) => ({
      label: label as string,
      value: summaryValue(rawValue, maxLength),
    }))
    .filter((field): field is ToolSummaryField => Boolean(field.value));

  if (fields.length > 0) {
    return fields;
  }

  const firstEntry = Object.entries(record).find(([, rawValue]) => summaryValue(rawValue, maxLength));
  return firstEntry
    ? [{ label: firstEntry[0], value: summaryValue(firstEntry[1], maxLength) ?? "" }]
    : [];
}
