// Skeleton feed Explore — meniru layout nyata ExploreFindings (hero spotlight
// image-right → grid 3-up standard card → feature card) supaya loading tidak
// menggeser layout (CLS) & terasa instan. Dipakai di branch `isPending`
// menggantikan spinner. Struktur & kelas sengaja mengikuti discovery-item-card.tsx
// (DiscoverySpotlightCard + DiscoveryStandardCard) dan grid ExploreFindings, jadi
// bentuk placeholder ≈ kartu asli begitu data tiba.

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function ExploreFeedSkeleton() {
  return (
    <div className="space-y-10" role="status" aria-label="Memuat temuan…">
      <SpotlightCardSkeleton size="hero" imageSide="right" />
      <div className="grid grid-cols-1 gap-x-5 gap-y-8 @md/feed:grid-cols-2 @2xl/feed:grid-cols-3">
        {["a", "b", "c", "d", "e", "f"].map((key) => (
          <StandardCardSkeleton key={key} />
        ))}
      </div>
      <SpotlightCardSkeleton size="feature" imageSide="left" />
    </div>
  );
}

// Mirror DiscoverySpotlightCard: grid media + kolom teks (judul 2 baris, tldr 3
// baris, footer sumber). Sisi gambar & tinggi media mengikuti size hero/feature.
function SpotlightCardSkeleton({
  size,
  imageSide,
}: {
  size: "hero" | "feature";
  imageSide: "left" | "right";
}) {
  const mediaHeight =
    size === "hero"
      ? "h-52 sm:h-64 @xl/feed:h-full @xl/feed:min-h-[300px]"
      : "h-48 sm:h-56 @xl/feed:h-full @xl/feed:min-h-[224px]";
  const titleHeight = size === "hero" ? "h-7 sm:h-8" : "h-6 sm:h-7";
  const columns =
    imageSide === "left"
      ? "@xl/feed:grid-cols-[minmax(260px,40%)_minmax(0,1fr)]"
      : "@xl/feed:grid-cols-[minmax(0,1fr)_minmax(260px,40%)]";

  return (
    <article>
      <div className={cn("grid gap-5 @xl/feed:items-stretch @xl/feed:gap-7", columns)}>
        <div className={cn("order-1", imageSide === "left" ? "@xl/feed:order-1" : "@xl/feed:order-2")}>
          <Skeleton className={cn("w-full rounded-[12px]", mediaHeight)} />
        </div>

        <div
          className={cn(
            "order-2 flex min-w-0 flex-col justify-center",
            imageSide === "left" ? "@xl/feed:order-2" : "@xl/feed:order-1",
          )}
        >
          <div className="space-y-2.5">
            <Skeleton className={cn("w-[92%]", titleHeight)} />
            <Skeleton className={cn("w-[64%]", titleHeight)} />
          </div>
          <div className="mt-4 space-y-2">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-[78%]" />
          </div>
          <div className="mt-5 border-t border-border/50 pt-3">
            <FooterSkeleton />
          </div>
        </div>
      </div>
    </article>
  );
}

// Mirror DiscoveryStandardCard: media aspect-16/10 + judul 2 baris + footer.
function StandardCardSkeleton() {
  return (
    <article className="flex flex-col">
      <Skeleton className="aspect-[16/10] w-full rounded-[12px]" />
      <div className="flex min-w-0 flex-1 flex-col pt-2.5">
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-[70%]" />
        </div>
        <div className="mt-auto pt-3">
          <FooterSkeleton />
        </div>
      </div>
    </article>
  );
}

// Mirror CardFooter: avatar sumber size-5 + label, ikon save + overflow di kanan.
function FooterSkeleton() {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Skeleton className="size-5 shrink-0 rounded-full" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="size-8 rounded-full" />
      </div>
    </div>
  );
}
