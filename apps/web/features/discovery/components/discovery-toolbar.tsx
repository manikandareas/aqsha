"use client";

import { FilterIcon, Loader2Icon, SearchIcon } from "@aqsha/ui/icons";
import { type FormEvent, useRef, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  type DiscoveryRange,
  type DiscoveryView,
  discoveryRangeLabels,
  discoveryRanges,
} from "../hooks/use-discovery-nav";

const VIEW_LABELS: Array<{ value: DiscoveryView; label: string }> = [
  { value: "brief", label: "Brief" },
  { value: "papers", label: "Papers" },
];

// Discover-style underline tabs. Plain text labels with a 2px indicator under the
// active one, anchored to the header's bottom edge (buttons span the full header
// height). Rendered in the shared Explore header's center slot so the page top
// stays tidy: title left · tabs centered · chat toggle right.
export function DiscoveryViewTabs({
  view,
  onViewChange,
}: {
  view: DiscoveryView;
  onViewChange: (view: DiscoveryView) => void;
}) {
  return (
    <nav className="flex h-14 items-stretch gap-6" aria-label="Tampilan jelajahi">
      {VIEW_LABELS.map((entry) => {
        const active = view === entry.value;
        return (
          <button
            key={entry.value}
            type="button"
            onClick={() => onViewChange(entry.value)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative inline-flex items-center text-[14px] font-medium transition-colors",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {entry.label}
            {active ? (
              <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground" />
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

// Papers-only control row (search + time range). The Brief view needs no
// controls, so the page renders this only for `papers` — keeping the feed flush
// under the header otherwise.
export function DiscoveryToolbar({
  query,
  onSubmitQuery,
  range,
  onRangeChange,
  isSearching,
}: {
  query: string;
  onSubmitQuery: (query: string) => void;
  range: DiscoveryRange;
  onRangeChange: (range: DiscoveryRange) => void;
  isSearching: boolean;
}) {
  const [rangeOpen, setRangeOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmitQuery((inputRef.current?.value ?? "").trim());
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border/70 pb-3">
      <form
        onSubmit={handleSubmit}
        className="flex h-9 w-full min-w-0 items-center rounded-[8px] border border-border/80 bg-card/50 px-2 sm:w-[280px]"
      >
        <label htmlFor="discovery-search" className="sr-only">
          Cari paper
        </label>
        <input
          key={query}
          id="discovery-search"
          ref={inputRef}
          defaultValue={query}
          placeholder="Cari paper… Enter untuk mencari"
          className="h-8 min-w-0 flex-1 bg-transparent text-[13px] font-medium text-foreground outline-none placeholder:text-muted-foreground"
        />
        <span className="inline-flex size-7 shrink-0 items-center justify-center text-muted-foreground">
          {isSearching ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <SearchIcon className="size-4" strokeWidth={2} />
          )}
        </span>
      </form>
      <RangePopover
        range={range}
        open={rangeOpen}
        onOpenChange={setRangeOpen}
        onRangeChange={(next) => {
          onRangeChange(next);
          setRangeOpen(false);
        }}
      />
    </div>
  );
}

function RangePopover({
  range,
  open,
  onOpenChange,
  onRangeChange,
}: {
  range: DiscoveryRange;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRangeChange: (range: DiscoveryRange) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[8px] border border-border/80 px-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            range !== "all" && "bg-muted text-foreground",
          )}
          aria-label={`Filter berdasarkan waktu: ${discoveryRangeLabels[range]}`}
        >
          <FilterIcon className="size-4" strokeWidth={2} />
          {discoveryRangeLabels[range]}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-1.5">
        <div className="px-2 py-1.5">
          <p className="text-[12px] font-semibold text-muted-foreground">Rentang waktu</p>
        </div>
        <div className="grid gap-1">
          {discoveryRanges.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onRangeChange(value)}
              className={cn(
                "flex h-8 w-full items-center justify-between rounded-[7px] px-2.5 text-left text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                range === value && "bg-muted text-foreground",
              )}
            >
              <span>{discoveryRangeLabels[value]}</span>
              {range === value ? (
                <span className="size-1.5 rounded-full bg-foreground" />
              ) : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
