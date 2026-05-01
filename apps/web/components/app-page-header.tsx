import type { ReactNode } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type AppPageHeaderProps = {
  title: ReactNode;
  actions?: ReactNode;
  sticky?: boolean;
};

export function AppPageHeader({ title, actions, sticky }: AppPageHeaderProps) {
  return (
    <header
      className={cn(
        "flex h-14 shrink-0 items-center justify-between bg-background",
        sticky && "sticky top-0 z-50",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
        <SidebarTrigger />
        <Separator
          orientation="vertical"
          className="mr-2 data-vertical:h-4 data-vertical:self-auto"
        />
        <Breadcrumb className="min-w-0">
          <BreadcrumbList className="min-w-0 flex-nowrap">
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="line-clamp-1">{title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2 px-3">{actions}</div>
      ) : null}
    </header>
  );
}
