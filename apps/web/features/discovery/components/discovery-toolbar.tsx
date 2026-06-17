"use client";

import {
  ChevronDownIcon,
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
import { cn } from "@/lib/utils";
import {
  type DiscoveryMode,
  type DiscoveryRange,
  type DiscoveryTopicCategory,
  discoveryModeLabels,
  discoveryRangeLabels,
  discoveryRanges,
  discoveryTopicCategories,
  discoveryTopicCategoryLabels,
} from "../hooks/use-discovery-nav";

// Discover-style underline nav (For You · Top · Topics) rendered in the shared
// Explore header's center slot. For You / Top are plain mode tabs; Topics is a
// popover of the science/health categories — picking one switches to topics mode
// with that category. The active tab carries a 2px indicator anchored to the
// header's bottom edge (buttons span the full header height).
export function DiscoveryModeNav({
  mode,
  topic,
  onSelectMode,
  onSelectTopic,
}: {
  mode: DiscoveryMode;
  topic: DiscoveryTopicCategory | null;
  onSelectMode: (mode: "foryou" | "top") => void;
  onSelectTopic: (topic: DiscoveryTopicCategory) => void;
}) {
  const [topicsOpen, setTopicsOpen] = useState(false);

  return (
    <nav className="flex h-14 items-stretch gap-6" aria-label="Mode jelajahi">
      <ModeTab
        label={discoveryModeLabels.foryou}
        active={mode === "foryou"}
        onClick={() => onSelectMode("foryou")}
      />
      <ModeTab
        label={discoveryModeLabels.top}
        active={mode === "top"}
        onClick={() => onSelectMode("top")}
      />
      <Popover open={topicsOpen} onOpenChange={setTopicsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-current={mode === "topics" ? "page" : undefined}
            className={cn(
              "relative inline-flex items-center gap-1 text-[14px] font-medium transition-colors",
              mode === "topics"
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {mode === "topics" && topic
              ? discoveryTopicCategoryLabels[topic]
              : discoveryModeLabels.topics}
            <ChevronDownIcon className="size-3.5" />
            {mode === "topics" ? (
              <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground" />
            ) : null}
          </button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-56 p-1.5">
          <div className="px-2 py-1.5">
            <p className="text-[12px] font-semibold text-muted-foreground">
              Pilih topik
            </p>
          </div>
          <div className="grid gap-1">
            {discoveryTopicCategories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => {
                  onSelectTopic(category);
                  setTopicsOpen(false);
                }}
                className={cn(
                  "flex h-8 w-full items-center justify-between rounded-[7px] px-2.5 text-left text-[12.5px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  mode === "topics" &&
                    topic === category &&
                    "bg-muted text-foreground",
                )}
              >
                <span>{discoveryTopicCategoryLabels[category]}</span>
                {mode === "topics" && topic === category ? (
                  <span className="size-1.5 rounded-full bg-foreground" />
                ) : null}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </nav>
  );
}

function ModeTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative inline-flex items-center text-[14px] font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {active ? (
        <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground" />
      ) : null}
    </button>
  );
}

// Global search + time-range filter, rendered in the Explore header's right cell
// (Isu 7). Search applies across every mode; submitting a non-empty query flips
// the surface into cross-content search results.
export function DiscoveryHeaderControls({
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
    <div className="flex items-center gap-1.5">
      <form
        onSubmit={handleSubmit}
        className="flex h-8 min-w-0 items-center rounded-[8px] border border-border/80 bg-card/50 px-2 sm:w-[220px]"
      >
        <label htmlFor="discovery-search" className="sr-only">
          Cari
        </label>
        <span className="inline-flex size-6 shrink-0 items-center justify-center text-muted-foreground">
          {isSearching ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <SearchIcon className="size-3.5" strokeWidth={2} />
          )}
        </span>
        <input
          key={query}
          id="discovery-search"
          ref={inputRef}
          defaultValue={query}
          placeholder="Cari…"
          className="hidden h-7 min-w-0 flex-1 bg-transparent text-[13px] font-medium text-foreground outline-none placeholder:text-muted-foreground sm:block"
        />
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
            "relative inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[8px] border border-border/80 px-2 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            range !== "all" && "bg-muted text-foreground",
          )}
          aria-label={`Filter berdasarkan waktu: ${discoveryRangeLabels[range]}`}
        >
          <FilterIcon className="size-3.5" strokeWidth={2} />
          <span className="hidden sm:inline">{discoveryRangeLabels[range]}</span>
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
