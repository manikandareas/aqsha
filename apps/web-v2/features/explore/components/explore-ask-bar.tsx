"use client";

// Ask-bar hero. Submit → dropdown "sumber terkait" memakai pencarian feed NYATA
// (useSearchDiscovery), bukan jawaban tersintesis (copy jujur). Pencarian penuh
// di luar scope prototype (PRD §13).

import { SearchIcon, XIcon } from "@aqsha/ui/icons";
import Link from "next/link";
import { useState } from "react";
import { useSearchDiscovery } from "@/features/discovery/api";
import { formatCitationCount, sourceName } from "@/features/discovery/format";
import { feedItemHref, type FeedItem } from "@/features/discovery/types";
import { deriveTrustFromItem, TrustBadge } from "../lib/trust";

export function ExploreAskBar() {
  const [draft, setDraft] = useState("");
  const [term, setTerm] = useState("");

  const search = useSearchDiscovery(term);
  const open = term.trim().length > 0;

  const submit = () => {
    const q = draft.trim();
    if (q) setTerm(q);
  };

  const results = (search.data?.pages ?? []).flatMap((p) => p.items as FeedItem[]).slice(0, 4);

  return (
    <div className="max-w-[520px]">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3.5 shadow-xs transition-colors focus-within:border-ring/55">
        <SearchIcon className="size-[18px] shrink-0 text-muted-foreground" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          type="text"
          placeholder="Tanya atau cari topik…"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={submit}
          aria-label="Cari"
          className="shrink-0 rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          ↵
        </button>
      </div>

      {open ? (
        <div className="mt-2.5 rounded-2xl border border-border bg-card p-4 shadow-xs">
          <div className="mb-2.5 flex items-center gap-2">
            <span className="font-mono text-[10px] tracking-wide text-muted-foreground">Sumber terkait</span>
            <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">“{term}”</span>
            <button
              type="button"
              onClick={() => setTerm("")}
              aria-label="Tutup"
              className="ml-auto inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>

          {search.isPending ? (
            <p className="py-2 text-[12.5px] text-muted-foreground">Mencari sumber…</p>
          ) : results.length === 0 ? (
            <p className="py-2 text-[12.5px] text-muted-foreground">Tidak ada sumber untuk “{term}”.</p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {results.map((raw) => {
                const trust = deriveTrustFromItem(raw);
                const { href } = feedItemHref(raw);
                const cit = raw.kind === "paper" ? formatCitationCount(raw.citedByCount) : null;
                return (
                  <Link
                    key={raw._id}
                    href={href}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-secondary"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-heading text-[14px] font-semibold text-foreground">
                        {raw.title}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[10.5px] text-muted-foreground">
                        {sourceName(raw)}
                        {cit ? ` · ${cit}` : ""}
                      </span>
                    </span>
                    {trust ? <TrustBadge status={trust} /> : null}
                  </Link>
                );
              })}
            </div>
          )}

          <p className="mt-2 border-t border-border pt-2.5 font-mono text-[10.5px] text-muted-foreground">
            Menampilkan {results.length} sumber teratas dari indeks.
          </p>
        </div>
      ) : null}
    </div>
  );
}
