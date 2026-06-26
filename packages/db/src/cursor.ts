/**
 * Keyset-pagination cursor helpers (mengganti `paginate()` opaque cursor Convex).
 *
 * Cursor membungkus `(updatedAt, id)` baris terakhir suatu halaman sebagai string
 * opaque base64(JSON) — frontend memperlakukannya sebagai token buram dan
 * mengirim balik via `?cursor=`. `id` adalah tiebreaker stabil karena `updatedAt`
 * (epoch-ms) bisa berbenturan antar baris.
 *
 * Reusable: dipakai `WorkspaceRepo` (P2) dan akan dipakai repo paginated lain
 * (threads/feed) di fase berikutnya.
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

/**
 * Cursor relevance keyset untuk searchDiscovery: `(rank, orderAt, id)` — primary sort `ts_rank`
 * desc (port relevance-order V1), tiebreaker kronologis. `r` deterministik per (query,row),
 * jadi keyset stabil sepanjang query yang sama.
 */
export type SearchKeysetCursor = { r: number; u: number; i: string };

export function encodeSearchCursor(cursor: SearchKeysetCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64");
}

/**
 * Cursor untuk feed BERIMBANG paper↔news (FeedRepo.paginateBalanced). Dua lane keyset
 * independen (paper vs non-paper) digabung jadi satu token. Per-lane: `KeysetCursor`
 * (lanjut), `"end"` (lane habis — JANGAN re-query), atau `null` (mulai dari atas).
 * Sentinel `"end"` mencegah lane yang sudah habis ke-restart saat lane lain masih jalan.
 */
export type LaneCursor = KeysetCursor | "end";
export type BalancedCursor = { p: LaneCursor | null; n: LaneCursor | null };

function normalizeLane(value: unknown): LaneCursor | null {
  if (value === "end") return "end";
  if (
    value &&
    typeof value === "object" &&
    typeof (value as KeysetCursor).u === "number" &&
    typeof (value as KeysetCursor).i === "string"
  ) {
    return { u: (value as KeysetCursor).u, i: (value as KeysetCursor).i };
  }
  return null;
}

export function encodeBalancedCursor(cursor: BalancedCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64");
}

/** Decode toleran: korup → `null` (perlakukan sebagai halaman pertama, kedua lane dari atas). */
export function decodeBalancedCursor(value: string | null | undefined): BalancedCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64").toString("utf8")) as {
      p?: unknown;
      n?: unknown;
    };
    if (!parsed || typeof parsed !== "object") return null;
    return { p: normalizeLane(parsed.p), n: normalizeLane(parsed.n) };
  } catch {
    return null;
  }
}

export function decodeSearchCursor(value: string | null | undefined): SearchKeysetCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64").toString("utf8")) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as SearchKeysetCursor).r === "number" &&
      typeof (parsed as SearchKeysetCursor).u === "number" &&
      typeof (parsed as SearchKeysetCursor).i === "string"
    ) {
      const c = parsed as SearchKeysetCursor;
      return { r: c.r, u: c.u, i: c.i };
    }
    return null;
  } catch {
    return null;
  }
}
