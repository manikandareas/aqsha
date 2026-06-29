// Tipe view-model halaman Explore. Feed paper + berita memakai FeedItem dari
// features/discovery; tipe di sini untuk hero pills.

import type { FeedTopic } from "@/features/discovery/types";

// ── Hero — interest pills ──────────────────────────────────────────────────
// Pill = FeedTopic asli sehingga klik pill men-scope feed (perilaku nyata).
export type InterestPill = { id: FeedTopic | null; label: string };
