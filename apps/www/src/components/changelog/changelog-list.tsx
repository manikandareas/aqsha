import { ChangelogCard } from "@/components/changelog/changelog-card";
import { changelogColumn, changelogGutter } from "@/lib/changelog/layout";
import type { ChangelogEntry } from "@/lib/changelog/types";

export function ChangelogList({ entries }: { entries: ChangelogEntry[] }) {
  return (
    <main className={`${changelogColumn} py-14 sm:py-20`}>
      <header
        className={`${changelogGutter} animate-in fade-in fill-mode-both duration-500`}
      >
        <h1 className="font-heading text-[1.9rem] font-medium leading-tight text-foreground sm:text-[2.25rem]">
          Apa yang baru
        </h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Fitur baru, peningkatan, dan perbaikan di Aqsha — biar kamu selalu tahu
          apa yang berubah.
        </p>
      </header>

      {entries.length === 0 ? (
        <p className={`${changelogGutter} mt-10 text-sm text-muted-foreground`}>
          Belum ada pembaruan. Nantikan, ya.
        </p>
      ) : (
        <div className="mt-8 divide-y divide-border/60 border-y border-border/60">
          {entries.map((entry, index) => (
            <ChangelogCard key={entry.slug} entry={entry} index={index} />
          ))}
        </div>
      )}
    </main>
  );
}
