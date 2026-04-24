import { NodeApi } from "platejs"

/** Basic normalization for plate values. */
function normalizePlateValue(nodes: unknown): unknown[] {
  if (Array.isArray(nodes)) {
    return nodes
  }
  if (nodes === null || nodes === undefined) {
    return []
  }
  return [nodes]
}

/** Word count for plain text (whitespace-separated tokens). */
export function countWords(text: string): number {
  const normalized = text.trim()

  if (!normalized) {
    return 0
  }

  return normalized.split(/\s+/).length
}

/** Plain text from Plate editor value (top-level blocks). */
export function plateValueToPlainText(nodes: unknown): string {
  return normalizePlateValue(nodes)
    .map((n) => NodeApi.string(n as never))
    .join("\n")
}
