import Image from "next/image";

import { cn } from "@/lib/utils";
import { GenerativeCover } from "@/components/generative-cover";
import type { ChangelogEntry } from "@/features/changelog/types";

/**
 * Banner/thumbnail changelog — mengisi penuh wadahnya (`absolute inset-0`).
 * Pemanggil yang menentukan ukuran/aspect + border/rounding lewat `className`
 * (kartu: aspect di mobile, stretch di desktop; detail: aspect + rounded).
 * Pakai gambar `preview` (frontmatter) kalau ada; kalau kosong → cover generatif
 * deterministik (gradien brand dari hash judul).
 */
export function ChangelogPreview({
  entry,
  className,
  sizes = "(min-width: 640px) 208px, 100vw",
}: {
  entry: ChangelogEntry;
  className?: string;
  /**
   * Hint `next/image` untuk memilih kandidat srcset. Default = lebar thumbnail
   * kartu (208px di desktop); halaman detail meng-override ke lebar kolom penuh
   * supaya banner-nya tak di-upscale dari kandidat kecil.
   */
  sizes?: string;
}) {
  return (
    <div className={cn("relative w-full overflow-hidden bg-muted", className)}>
      {entry.preview ? (
        <Image
          src={entry.preview}
          alt=""
          fill
          sizes={sizes}
          className="object-cover"
        />
      ) : (
        <GenerativeCover
          title={entry.title}
          label={entry.version ? `v${entry.version}` : "Rilis"}
        />
      )}
    </div>
  );
}
