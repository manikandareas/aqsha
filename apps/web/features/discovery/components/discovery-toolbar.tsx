"use client";

import {
  CompassIcon,
  FilterIcon,
  Loader2Icon,
  SearchIcon,
} from "@aqsha/ui/icons";
import { type FormEvent, useRef, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  type DiscoveryLang,
  type DiscoveryRange,
  type DiscoveryView,
  discoveryRangeLabels,
  discoveryRanges,
} from "../hooks/use-discovery-nav";

const VIEW_LABELS: Array<{ value: DiscoveryView; label: string }> = [
  { value: "brief", label: "Brief" },
  { value: "papers", label: "Papers" },
  { value: "cek-fakta", label: "Cek fakta" },
];

export function DiscoveryToolbar({
  view,
  onViewChange,
  query,
  onSubmitQuery,
  range,
  onRangeChange,
  lang,
  onLangChange,
  serendipity,
  onSerendipityChange,
  isSearching,
}: {
  view: DiscoveryView;
  onViewChange: (view: DiscoveryView) => void;
  query: string;
  onSubmitQuery: (query: string) => void;
  range: DiscoveryRange;
  onRangeChange: (range: DiscoveryRange) => void;
  lang: DiscoveryLang;
  onLangChange: (lang: DiscoveryLang) => void;
  serendipity: boolean;
  onSerendipityChange: (value: boolean) => void;
  isSearching: boolean;
}) {
  const [rangeOpen, setRangeOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmitQuery((inputRef.current?.value ?? "").trim());
  };

  return (
    <section className="mt-8 border-b border-border/80 pb-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs value={view} onValueChange={(value) => onViewChange(value as DiscoveryView)}>
          <TabsList>
            {VIEW_LABELS.map((entry) => (
              <TabsTrigger key={entry.value} value={entry.value}>
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          {view === "papers" ? (
            <>
              <form
                onSubmit={handleSubmit}
                className="flex h-9 w-[220px] items-center rounded-[8px] border border-border/80 bg-card/50 px-2 sm:w-[300px]"
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
            </>
          ) : null}

          {view === "brief" ? (
            <button
              type="button"
              onClick={() => onSerendipityChange(!serendipity)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-[7px] border px-2.5 text-[12.5px] font-medium transition-colors",
                serendipity
                  ? "border-lavender-soft-border bg-lavender-soft text-lavender-foreground"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              title="Tampilkan bidang bersebelahan (anti filter bubble)"
            >
              <CompassIcon className="size-3.5" /> Serendipity
            </button>
          ) : null}

          <LangToggle lang={lang} onLangChange={onLangChange} />
        </div>
      </div>
    </section>
  );
}

function LangToggle({
  lang,
  onLangChange,
}: {
  lang: DiscoveryLang;
  onLangChange: (lang: DiscoveryLang) => void;
}) {
  return (
    <div className="inline-flex h-8 items-center rounded-[7px] border border-border p-0.5">
      {(["id", "en"] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => onLangChange(code)}
          className={cn(
            "h-7 rounded-[5px] px-2 text-[12px] font-semibold uppercase transition-colors",
            lang === code
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {code}
        </button>
      ))}
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
            "relative inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-border/80 px-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
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
