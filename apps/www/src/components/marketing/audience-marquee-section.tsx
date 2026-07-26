const AUDIENCE_MARKERS = [
  "Skripsi",
  "Tesis",
  "Disertasi",
  "Artikel jurnal",
  "Proposal",
  "Makalah",
] as const;

export function AudienceMarqueeSection() {
  return (
    <section
      aria-label="Aqsha untuk karya tulis akademik"
      className="pt-16 sm:pt-24"
    >
      <div className="mx-auto max-w-7xl px-4 pb-7 text-center sm:px-6 sm:pb-8">
        <p className="mx-auto max-w-2xl text-pretty text-lg leading-snug text-foreground/75 sm:text-xl">
          Untuk karya tulis yang sedang kamu kerjakan—dari ide awal sampai draf siap direview.
        </p>
      </div>
      <div className="overflow-hidden border-y-2 border-border bg-primary">
        <ul className="mx-auto flex w-full max-w-7xl flex-wrap items-stretch justify-center">
          {AUDIENCE_MARKERS.map((marker) => (
            <li
              key={marker}
              className="border-l-2 border-primary-foreground/15 px-6 py-5 text-sm font-bold text-primary-foreground first:border-l-0 sm:px-9 sm:py-6"
            >
              {marker}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
