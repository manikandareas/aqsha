"use client";

import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const UPGRADE_HREF = "/app/settings/usage-billing";

export function SidebarProCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-[12px] border border-sidebar-border/70 bg-card",
        className,
      )}
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-white">
        <Image
          src="/pro-card.png"
          alt=""
          fill
          sizes="240px"
          className="object-cover"
        />
      </div>

      <div className="grid gap-2.5 p-3">
        <div className="grid gap-1">
          <p className="font-heading text-[13px] font-semibold leading-tight text-card-foreground">
            Buka Aqsha Pro
          </p>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Riset tanpa batas dan model paling kuat untuk menelaah paper.
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <Button asChild size="sm" className="h-7 flex-1 text-[12px]">
            <Link href={UPGRADE_HREF}>Upgrade</Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-7 flex-1 text-[12px]"
          >
            <Link href={UPGRADE_HREF}>Pelajari</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
