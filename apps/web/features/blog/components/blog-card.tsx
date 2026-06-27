import type { CSSProperties } from "react";
import Link from "next/link";

import { formatPostDate } from "@/features/blog/lib/format";
import { blogEase, blogGutter } from "@/features/blog/lib/layout";
import type { BlogPost } from "@/features/blog/types";

export function BlogCard({ post, index = 0 }: { post: BlogPost; index?: number }) {
  return (
    <Link
      href={post.url}
      // Gutter sbg padding internal → hover full-lebar baris, teks tetap rata
      // dengan heading. Fade-in halus per item (no slide → lebih tenang).
      style={{ "--tw-animation-delay": `${Math.min(index, 8) * 60}ms` } as CSSProperties}
      className={`group block animate-in fade-in fill-mode-both duration-500 ${blogGutter} py-5 transition-colors ${blogEase} hover:bg-muted/40`}
    >
      <p className="text-xs text-muted-foreground">
        {formatPostDate(post.publishedAt)}
        <span className="px-1.5 text-muted-foreground/40">·</span>
        {post.readingTime} menit baca
      </p>

      <h2 className="mt-1.5 text-base font-medium leading-snug text-foreground sm:text-[1.0625rem]">
        {post.title}
      </h2>

      <p className="mt-1.5 line-clamp-2 max-w-xl text-sm leading-6 text-muted-foreground">
        {post.excerpt}
      </p>
    </Link>
  );
}
