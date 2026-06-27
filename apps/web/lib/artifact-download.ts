import type { ArtifactRenderPayload } from "@/features/workspaces/components/artifact-render-panels";

/**
 * A downloadable representation of an artifact. File-backed artifacts (pdf/docx)
 * stream straight from object storage through an anchor `download`; every other
 * type is synthesized client-side into a Blob with the right extension + mime so
 * the reader can always save exactly what they're looking at.
 */
export type ArtifactDownload =
  | { kind: "url"; href: string; fileName: string }
  | { kind: "blob"; mime: string; fileName: string; getText: () => string };

type SourceArtifactType =
  | "plain_text"
  | "html"
  | "svg"
  | "mermaid"
  | "json"
  | "csv"
  | "code";

const SOURCE_DOWNLOAD_SPEC: Record<SourceArtifactType, { mime: string; ext: string }> = {
  plain_text: { mime: "text/plain", ext: "txt" },
  html: { mime: "text/html", ext: "html" },
  svg: { mime: "image/svg+xml", ext: "svg" },
  mermaid: { mime: "text/plain", ext: "mmd" },
  json: { mime: "application/json", ext: "json" },
  csv: { mime: "text/csv", ext: "csv" },
  code: { mime: "text/plain", ext: "txt" },
};

const CODE_EXTENSIONS: Record<string, string> = {
  javascript: "js",
  js: "js",
  typescript: "ts",
  ts: "ts",
  tsx: "tsx",
  jsx: "jsx",
  python: "py",
  py: "py",
  ruby: "rb",
  go: "go",
  rust: "rs",
  java: "java",
  kotlin: "kt",
  swift: "swift",
  php: "php",
  c: "c",
  cpp: "cpp",
  "c++": "cpp",
  csharp: "cs",
  cs: "cs",
  sql: "sql",
  bash: "sh",
  sh: "sh",
  shell: "sh",
  yaml: "yaml",
  yml: "yml",
  toml: "toml",
  css: "css",
  xml: "xml",
  markdown: "md",
  md: "md",
};

/** A filesystem-safe stem derived from the artifact title (never empty). */
function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "artifact";
}

function codeExtension(language: string | undefined): string {
  if (!language) return "txt";
  return CODE_EXTENSIONS[language.toLowerCase()] ?? "txt";
}

export function resolveArtifactDownload(
  payload: ArtifactRenderPayload,
  title: string,
): ArtifactDownload {
  const slug = slugifyTitle(title);

  // Source-bearing types: plain_text | html | svg | mermaid | json | csv | code.
  // The `"source" in payload` presence check narrows this union cleanly.
  if ("source" in payload) {
    const spec = SOURCE_DOWNLOAD_SPEC[payload.artifactType];
    const ext = payload.artifactType === "code" ? codeExtension(payload.language) : spec.ext;
    return {
      kind: "blob",
      mime: spec.mime,
      fileName: `${slug}.${ext}`,
      getText: () => payload.source,
    };
  }

  if (payload.artifactType === "markdown") {
    return {
      kind: "blob",
      mime: "text/markdown",
      fileName: `${slug}.md`,
      getText: () => payload.markdown,
    };
  }

  if (payload.artifactType === "url") {
    return {
      kind: "blob",
      mime: "text/plain",
      fileName: `${slug}.txt`,
      getText: () => payload.readableText,
    };
  }

  // Remaining file-backed types: pdf | docx — stream straight from object storage.
  return { kind: "url", href: payload.url, fileName: payload.fileName };
}

/** Synthesize a Blob download and click it through a transient anchor. */
export function triggerArtifactDownload(
  download: Extract<ArtifactDownload, { kind: "blob" }>,
): void {
  const blob = new Blob([download.getText()], { type: download.mime });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = download.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
