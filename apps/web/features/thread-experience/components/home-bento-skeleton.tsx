"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function HomeBentoSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-5 @xl/feed:grid-cols-[minmax(0,1fr)_minmax(280px,40%)] @xl/feed:gap-7">
        <div className="order-2 flex flex-col justify-center gap-3 @xl/feed:order-1">
          <Skeleton className="h-3 w-28 rounded-full bg-muted/50" />
          <Skeleton className="h-7 w-[85%] rounded-[8px] bg-muted/60" />
          <Skeleton className="h-7 w-[65%] rounded-[8px] bg-muted/60" />
          <Skeleton className="mt-1 h-4 w-full rounded-full bg-muted/40" />
          <Skeleton className="h-4 w-[80%] rounded-full bg-muted/40" />
        </div>
        <Skeleton className="order-1 h-48 w-full rounded-[12px] bg-muted/60 @xl/feed:order-2 @xl/feed:h-full" />
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-8 @md/feed:grid-cols-2 @3xl/feed:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-3">
            <Skeleton className="aspect-[16/10] w-full rounded-[12px] bg-muted/50" />
            <Skeleton className="h-5 w-[85%] rounded-[6px] bg-muted/50" />
            <Skeleton className="h-4 w-1/2 rounded-full bg-muted/40" />
          </div>
        ))}
      </div>
    </div>
  );
}
