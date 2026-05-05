export type ChunkOptions = {
  size: number;
  overlap?: number;
};

export function chunkText(body: string, opts: ChunkOptions): string[] {
  const size = Math.max(1, opts.size);
  const overlap = Math.max(0, Math.min(opts.overlap ?? 0, size - 1));
  const trimmed = body.trim();
  if (!trimmed) return [];
  if (trimmed.length <= size) return [trimmed];

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < trimmed.length) {
    const remaining = trimmed.length - cursor;
    let end = cursor + Math.min(size, remaining);

    if (end < trimmed.length) {
      const window = trimmed.slice(cursor, end);
      const breakIdx = findBoundary(window);
      if (breakIdx > size * 0.5) {
        end = cursor + breakIdx;
      }
    }

    const slice = trimmed.slice(cursor, end).trim();
    if (slice) chunks.push(slice);

    if (end >= trimmed.length) break;
    cursor = Math.max(end - overlap, cursor + 1);
  }

  return chunks;
}

function findBoundary(window: string): number {
  const candidates = [
    window.lastIndexOf("\n\n"),
    window.lastIndexOf("\n"),
    window.lastIndexOf(". "),
  ];
  return Math.max(...candidates);
}
