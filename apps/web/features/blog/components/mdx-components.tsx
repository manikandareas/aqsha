import type { ComponentProps } from "react";
import Link from "next/link";

/**
 * Override elemen HTML yang dihasilkan MDX. Server-safe (tanpa "use client"):
 * dipakai langsung di RSC. Komponen interaktif (butuh hooks) harus pakai
 * "use client" dan ditambahkan terpisah.
 */
export const mdxComponents = {
  a: ({ href = "", children, ...props }: ComponentProps<"a">) =>
    href.startsWith("/") ? (
      <Link href={href} {...props}>
        {children}
      </Link>
    ) : (
      <a href={href} rel="noreferrer" {...props}>
        {children}
      </a>
    ),
  img: (props: ComponentProps<"img">) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img loading="lazy" {...props} alt={props.alt ?? ""} />
  ),
};
