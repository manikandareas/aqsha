// Shared, icon-free artifact presentation (answer-stream redesign Fase 4).
//
// The type label + provenance + year were inlined in `library-artifact-card.tsx`;
// the clickable chat artifact card (`chat-artifact-card.tsx`) needs the same copy.
// Kept pure (no React, no icon imports) so it is unit-tested directly; the matching
// icon-per-type lives in `artifact-type-icon.tsx`.

export type ArtifactSource = "manual" | "upload" | "agent" | "url";

/** Short, sentence-case type label shown on the card chip. */
export function artifactTypeLabel(artifactType: string | undefined): string {
  switch (artifactType) {
    case "url":
      return "URL";
    case "pdf":
      return "PDF";
    case "docx":
      return "DOCX";
    case "html":
      return "HTML";
    case "svg":
      return "SVG";
    case "mermaid":
      return "Mermaid";
    case "json":
      return "JSON";
    case "csv":
      return "CSV";
    case "spreadsheet":
      return "XLSX";
    case "code":
      return "Code";
    case "plain_text":
      return "Text";
    default:
      return "Markdown";
  }
}

// Provenance marker only for outputs, where origin is otherwise ambiguous.
// Sources (upload/url) are already conveyed by the type label (PDF/URL/...).
export function provenanceLabel(source: ArtifactSource | undefined): string | null {
  if (source === "agent") return "Agent";
  if (source === "manual") return "Catatan";
  return null;
}

export function formatArtifactYear(timestamp: number): string {
  const year = new Date(timestamp).getFullYear();
  return Number.isFinite(year) ? String(year) : "----";
}
