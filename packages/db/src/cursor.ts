/**
 * Keyset-pagination cursor helpers (mengganti `paginate()` opaque cursor Convex).
 *
 * Cursor membungkus `(updatedAt, id)` baris terakhir suatu halaman sebagai string
 * opaque base64(JSON) — frontend memperlakukannya sebagai token buram dan
 * mengirim balik via `?cursor=`. `id` adalah tiebreaker stabil karena `updatedAt`
 * (epoch-ms) bisa berbenturan antar baris.
 *
 * Reusable: dipakai repo paginated mana pun (workspaces, threads, artifacts, citations, feed).
 */
export type KeysetCursor = { u: number; i: string };

export function encodeKeysetCursor(cursor: KeysetCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64");
}

/** Decode toleran: cursor invalid/korup → `null` (perlakukan sebagai halaman pertama). */
export function decodeKeysetCursor(value: string | null | undefined): KeysetCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64").toString("utf8")) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as KeysetCursor).u === "number" &&
      typeof (parsed as KeysetCursor).i === "string"
    ) {
      return { u: (parsed as KeysetCursor).u, i: (parsed as KeysetCursor).i };
    }
    return null;
  } catch {
    return null;
  }
}
