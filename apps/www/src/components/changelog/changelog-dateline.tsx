import { cn } from "@/lib/utils";
import { formatDateId } from "@/lib/dates";
import type { ChangelogEntry } from "@/lib/changelog/types";

/**
 * Tanggal terbit + versi opsional dengan aksen token `text-chart-1`. Satu sumber
 * dipakai kartu timeline & header halaman detail (ukuran/margin via `className`).
 */
export function ChangelogDateline({
  entry,
  className,
}: {
  entry: ChangelogEntry;
  className?: string;
}) {
  return (
    <p className={cn("font-medium text-chart-1", className)}>
      <time dateTime={entry.publishedAt}>{formatDateId(entry.publishedAt)}</time>
      {entry.version && <span className="text-chart-1/70"> · v{entry.version}</span>}
    </p>
  );
}
