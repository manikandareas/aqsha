// Cover generatif deterministik untuk kartu paper/berita (dipakai kartu feed Explore &
// kartu "Paper terkait" di reader). Warna brand dipilih dari hash judul + inisial ghost
// besar + chip label; menggantikan kotak fallback datar. Lapisan `absolute inset-0` →
// pemanggil membungkus dengan wadah relatif ber-aspect (mis. aspect-[16/10]).

// Palet gradien brand — indeks dipilih deterministik dari hash judul.
export const COVER_GRADIENTS = [
  "linear-gradient(145deg, oklch(0.55 0.15 154), oklch(0.31 0.10 154))", // mint
  "linear-gradient(145deg, oklch(0.52 0.14 248), oklch(0.30 0.10 248))", // sky
  "linear-gradient(145deg, oklch(0.52 0.13 305), oklch(0.30 0.10 305))", // lavender
  "linear-gradient(145deg, oklch(0.56 0.15 34), oklch(0.33 0.11 34))", // coral
  "linear-gradient(145deg, oklch(0.50 0.07 70), oklch(0.30 0.05 70))", // warm gold/ink
];

export function hashIndex(value: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h) % mod;
}

/** Inisial pertama (huruf besar) dari teks; fallback "•" untuk teks kosong. */
export function firstInitial(text: string): string {
  return (text.trim()[0] ?? "•").toUpperCase();
}

export function GenerativeCover({
  title,
  label,
  openAccess,
}: {
  title: string;
  label: string;
  openAccess?: boolean;
}) {
  const initial = firstInitial(title);
  const gradient = COVER_GRADIENTS[hashIndex(title, COVER_GRADIENTS.length)];
  return (
    <div className="absolute inset-0 flex flex-col justify-end p-3 text-white" style={{ background: gradient }}>
      <span className="pointer-events-none absolute -top-7 right-1 select-none font-heading text-[150px] font-black leading-none text-white/15">
        {initial}
      </span>
      <div className="relative flex items-center gap-1.5">
        <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10.5px] font-bold tracking-wide text-zinc-900">
          {label}
        </span>
        {openAccess ? (
          <span className="rounded-full bg-black/35 px-2 py-0.5 text-[10.5px] font-semibold text-white backdrop-blur-sm">
            Open access
          </span>
        ) : null}
      </div>
    </div>
  );
}
