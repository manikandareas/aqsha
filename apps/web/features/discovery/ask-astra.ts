// Util "Tanya Astra": ubah item discovery (paper/berita) menjadi token konteks composer
// (ContextRef). Dipakai halaman baca Explore (token halaman) dan kartu feed/related
// (Tanya Astra → buka panel + sematkan token item itu). Label memuat judul PENUH —
// tampilan pill di-truncate CSS (token-pill), detail utuh muncul di tooltip.

import {
  buildExternalPaperMentionLabel,
  buildNewsMentionLabel,
  type ContextRef,
} from "@aqsha/chat-core";
import type { DiscoveryItem } from "./model";

/**
 * Petakan item discovery → token konteks. Paper (punya `paperKey`, dari hasil pencarian atau
 * feed paper) jadi `explore-paper` (hydrate via OpenAlex); selain itu (berita/feed) jadi `news`
 * (hydrate via feed item). Null bila tak bisa direpresentasikan.
 */
export function discoveryItemToContextRef(item: DiscoveryItem): ContextRef | null {
  const title = item.title;
  const paperKey = item.itemRef.kind === "paper" ? item.itemRef.paperKey : item.paperKey;
  if (paperKey) {
    return { kind: "explore-paper", paperKey, label: buildExternalPaperMentionLabel(title) };
  }
  if (item.itemRef.kind === "feed") {
    return { kind: "news", feedItemId: item.itemRef.feedItemId, label: buildNewsMentionLabel(title) };
  }
  return null;
}
