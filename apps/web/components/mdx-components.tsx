import type { ComponentProps } from "react";
import Link from "next/link";

/**
 * Override elemen HTML yang dihasilkan MDX — dipakai bersama blog & changelog.
 * Server-safe (tanpa "use client"): dipakai langsung di RSC. Komponen interaktif
 * (butuh hooks) harus pakai "use client" dan ditambahkan terpisah.
 */
export const mdxComponents = {
  a: ({ href = "", children, rel, ...props }: ComponentProps<"a">) =>
    // `//host` adalah URL protocol-relative (eksternal), bukan path internal —
    // wajib dikecualikan dari `<Link>`.
    href.startsWith("/") && !href.startsWith("//") ? (
      <Link href={href} {...props}>
        {children}
      </Link>
    ) : (
      // `noreferrer` dijamin ada; `rel` dari caller (kalau ada) di-merge, bukan
      // menimpa nilai keamanan ini.
      <a href={href} {...props} rel={rel ? `${rel} noreferrer` : "noreferrer"}>
        {children}
      </a>
    ),
  img: (props: ComponentProps<"img">) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img loading="lazy" {...props} alt={props.alt ?? ""} />
  ),
};
