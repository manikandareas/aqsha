import { ExternalLinkIcon, GlobeIcon } from "@aqsha/ui/icons";
import { cn } from "@/lib/utils";

// One cited/gathered source as a clickable row: favicon (with a Globe fallback
// when no favicon resolves) + title + domain + outbound affordance. Shared by
// the sub-agent detail panel (WS5) and the answer-level Sources collapsible
// (WS7) so the provenance row reads identically everywhere. Pure presentation —
// the caller passes an already-resolved `SourceLinkItem` (no raw payload).
export type SourceLinkItem = {
  key: string;
  title: string;
  url?: string;
  domain: string | null;
  favicon: string | null;
};

const rowClass =
  "flex min-w-0 items-start gap-2 rounded-[8px] px-2 py-1.5 transition-colors";

function Favicon({ favicon }: { favicon: string | null }) {
  if (favicon) {
    return (
      <span
        aria-hidden
        className="mt-0.5 size-4 shrink-0 rounded-[4px] bg-muted bg-cover bg-center"
        style={{ backgroundImage: `url("${favicon}")` }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] bg-muted text-muted-foreground"
    >
      <GlobeIcon className="size-3" />
    </span>
  );
}

export function SourceLinkRow({ link }: { link: SourceLinkItem }) {
  const content = (
    <>
      <Favicon favicon={link.favicon} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 break-words text-[13px] leading-5 text-foreground">
          {link.title}
        </span>
      </span>
      {link.domain ? (
        <span className="mt-0.5 shrink-0 text-[12px] text-muted-foreground">
          {link.domain}
        </span>
      ) : null}
    </>
  );

  if (link.url) {
    return (
      <li>
        <a
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            rowClass,
            "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {content}
          <ExternalLinkIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        </a>
      </li>
    );
  }

  return <li className={rowClass}>{content}</li>;
}
