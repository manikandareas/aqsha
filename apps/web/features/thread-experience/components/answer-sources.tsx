"use client";

import { ChevronDownIcon, Link2Icon } from "@aqsha/ui/icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { domainFromUrl, faviconUrl } from "@/features/explore/utils/reader-format";
import type { ResearchSource } from "../types";
import { SourceLinkRow, type SourceLinkItem } from "./source-link-row";

// Answer-level Sources list (WS7, AI-Elements Sources pattern). Renders INLINE
// under the assistant answer — never a side panel — so it works identically on
// the full thread surface and the compact workspace/explore chat panels (D2
// parity). The run's sources are deduped by url (Perplexity clustering) so the
// count and list reflect UNIQUE provenance, not raw per-query rows. Reuses the
// shared `SourceLinkRow`.
function dedupeSourceLinks(sources: ResearchSource[]): SourceLinkItem[] {
  const seen = new Set<string>();
  const links: SourceLinkItem[] = [];
  for (const source of sources) {
    const dedupeKey = source.url ?? source._id;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const domain = source.url ? domainFromUrl(source.url) : null;
    links.push({
      key: source._id,
      title: source.title,
      url: source.url,
      domain: domain ?? source.provider ?? null,
      favicon: source.url ? faviconUrl(source.url) : null,
    });
  }
  return links;
}

export function AnswerSources({ sources }: { sources: ResearchSource[] }) {
  const links = dedupeSourceLinks(sources);
  if (links.length === 0) {
    return null;
  }

  return (
    <Collapsible className="mt-3 w-full min-w-0">
      <CollapsibleTrigger className="group flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground">
        <Link2Icon className="size-3.5 shrink-0" />
        <span>{links.length} sumber</span>
        <ChevronDownIcon className="size-3.5 shrink-0 opacity-0 transition-all group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=open]:rotate-180 group-data-[state=open]:opacity-100" />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden">
        <ul className="mt-1.5 grid gap-0.5">
          {links.map((link) => (
            <SourceLinkRow key={link.key} link={link} />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
