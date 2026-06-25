"use client";

import Link from "next/link";
import { Button } from "@aqsha/ui/components/button";
import { ArrowUpRightIcon } from "@aqsha/ui/icons";
import { useFeedHome } from "../api";
import { FeedCard } from "./feed-card";

/**
 * Teaser discovery di /app (bento home, getFeed). Read-only sampel; tautan ke /app/explore
 * untuk feed penuh. Diam saat kosong (feed belum ter-hidrasi).
 */
export function HomeExploreBento({ limit = 4 }: { limit?: number }) {
  const query = useFeedHome();
  const items = (query.data ?? []).slice(0, limit);
  if (query.isPending || items.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl">Jelajahi</h2>
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link href="/app/explore">
            Lihat semua
            <ArrowUpRightIcon />
          </Link>
        </Button>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item._id}>
            <FeedCard item={item} onHidden={() => undefined} />
          </li>
        ))}
      </ul>
    </section>
  );
}
