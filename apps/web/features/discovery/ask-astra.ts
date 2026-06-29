// Util "Tanya Astra": ubah item discovery (paper/berita) menjadi token konteks composer
// (ContextRef) + pendek-kan judul untuk label pill. Dipakai halaman baca Explore (token halaman)
// dan kartu feed/related (Tanya Astra → buka panel + sematkan token item itu).

import {
  buildExternalPaperMentionLabel,
  buildNewsMentionLabel,
  type ContextRef,
  messagePreview,
} from "@aqsha/chat-core";
import type { DiscoveryItem } from "./model";

/** Pendekkan judul untuk label pill agar token tetap ringkas walau judul panjang (clamp bersama). */
export function clampDiscoveryTitle(title: string, max = 42): string {
  return messagePreview(title, max);
}

/**
 * Petakan item discovery → token konteks. Paper (punya `paperKey`, dari hasil pencarian atau
 * feed paper) jadi `explore-paper` (hydrate via OpenAlex); selain itu (berita/feed) jadi `news`
 * (hydrate via feed item). Null bila tak bisa direpresentasikan.
 */
export function discoveryItemToContextRef(item: DiscoveryItem): ContextRef | null {
  const title = clampDiscoveryTitle(item.title);
  const paperKey = item.itemRef.kind === "paper" ? item.itemRef.paperKey : item.paperKey;
  if (paperKey) {
    return { kind: "explore-paper", paperKey, label: buildExternalPaperMentionLabel(title) };
  }
  if (item.itemRef.kind === "feed") {
    return { kind: "news", feedItemId: item.itemRef.feedItemId, label: buildNewsMentionLabel(title) };
  }
  return null;
}
