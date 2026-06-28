"use client";

// State Jelajah · peta paper ON-DEMAND. Konstelasi (force-directed, canvas) itu indah
// tapi berat & density-rendah untuk first paint → di Jelajah ia tidak otomatis tampil.
// Di sini sebagai tombol undangan; klik → mount ExploreConstellation (yang lazy-mount
// sendiri saat dekat viewport). Data facets sudah di-cache, jadi expand terasa instan.

import { CompassIcon } from "@aqsha/ui/icons";
import { useState } from "react";
import { ExploreConstellation } from "./explore-constellation";
import type { PaperEdge, PaperNode } from "../types";

export function ExploreMapReveal({
  nodes,
  edges,
  loading,
}: {
  nodes: PaperNode[];
  edges: PaperEdge[];
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const count = nodes.length;

  if (open) {
    return (
      <section className="pt-8">
        <div className="mb-2.5 flex justify-end">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Sembunyikan peta
          </button>
        </div>
        <ExploreConstellation nodes={nodes} edges={edges} loading={loading} />
      </section>
    );
  }

  return (
    <section className="pt-8">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-3.5 rounded-2xl border border-dashed border-border bg-card/20 px-4 py-4 text-left transition-[border-color,background-color] duration-150 ease-out hover:border-primary/50 hover:bg-card/40 sm:px-5"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground transition-colors group-hover:text-primary">
          <CompassIcon className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-heading text-base font-semibold tracking-tight text-foreground">
            Lihat peta paper terkait
          </span>
          <span className="block text-[12.5px] text-muted-foreground">
            {loading
              ? "Memetakan keterkaitan makna…"
              : count > 0
                ? `${count} paper · titik = paper, garis = kemiripan makna`
                : "Petakan paper relevan berdasarkan kemiripan makna"}
          </span>
        </span>
        <span className="shrink-0 font-mono text-[12px] text-muted-foreground transition-colors group-hover:text-primary">
          buka →
        </span>
      </button>
    </section>
  );
}
