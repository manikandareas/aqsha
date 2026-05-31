"use client";

import { ChevronRightIcon, PanelLeftIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type ExploreBreadcrumb = {
  label: string;
  href?: string;
};

export function ExploreSurfaceHeader({
  breadcrumbs,
}: {
  breadcrumbs: ExploreBreadcrumb[];
}) {
  const leftSidebar = useSidebar();
  const isLeftSidebarOpen = leftSidebar.isMobile
    ? leftSidebar.openMobile
    : leftSidebar.open;

  return (
    <header className="shrink-0 bg-background">
      <div
        className={cn(
          "flex min-h-14 w-full items-center gap-2 px-5 sm:px-8 lg:px-10",
        )}
      >
        {!isLeftSidebarOpen ? (
          <Button
            type="button"
            variant="ghost"
            className="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={leftSidebar.toggleSidebar}
            aria-label="Buka sidebar kiri"
          >
            <PanelLeftIcon className="size-3.5" />
          </Button>
        ) : null}
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-1 text-[12px] font-medium text-muted-foreground"
        >
          {breadcrumbs.map((item, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <span key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
                {index > 0 ? <ChevronRightIcon className="size-3 shrink-0" /> : null}
                {item.href && !isLast ? (
                  <Link href={item.href} className="truncate hover:text-foreground">
                    {item.label}
                  </Link>
                ) : (
                  <span className={cn("truncate", isLast && "font-semibold text-foreground")}>
                    {item.label}
                  </span>
                )}
              </span>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
