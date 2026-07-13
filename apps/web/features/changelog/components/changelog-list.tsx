import { ChangelogCard } from "@/features/changelog/components/changelog-card";
import { changelogColumn, changelogGutter } from "@/features/changelog/lib/layout";
import type { ChangelogEntry } from "@/features/changelog/types";

export function ChangelogList({ entries }: { entries: ChangelogEntry[] }) {
  return (
    <main className={`${changelogColumn} py-14 sm:py-20`}>
      <header className={`${changelogGutter} animate-in fade-in fill-mode-both duration-500`}>
        <h1 className="font-serif text-[1.9rem] leading-tight text-foreground sm:text-[2.25rem]">
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
        <div className={`${changelogGutter} mt-10 flex flex-col gap-4 sm:mt-12 sm:gap-5`}>
          {entries.map((entry) => (
            <ChangelogCard key={entry.slug} entry={entry} />
          ))}
        </div>
      )}
    </main>
  );
}
