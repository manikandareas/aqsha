import { ChangelogCard } from "@/components/changelog/changelog-card";
import { Button } from "@/components/ui/button";
import { changelogColumn, changelogGutter } from "@/lib/changelog/layout";
import { WAITLIST_PATH } from "@/lib/marketing/cta";
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
        <div
          className={`${changelogGutter} mt-10 max-w-md rounded-xl border-2 border-border bg-card p-5`}
        >
          <p className="font-medium text-foreground">Belum ada catatan rilis.</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Aqsha sedang menyiapkan akses awal untuk workflow riset dan penulisan berbasis proyek.
          </p>
          <Button asChild className="mt-5">
            <a href={WAITLIST_PATH}>Dapatkan kabar saat akses dibuka</a>
          </Button>
        </div>
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
