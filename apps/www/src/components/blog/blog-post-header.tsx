
import { ArrowLeftIcon } from "@/components/icons";

import { formatPostDate } from "@/lib/blog/format";
import { blogEase } from "@/lib/blog/layout";
import type { BlogPost } from "@/lib/blog/types";

export function BlogPostHeader({ post }: { post: BlogPost }) {
  return (
    <header className="animate-in fade-in fill-mode-both duration-500">
      <a
        href="/blog"
        className={`group inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors ${blogEase} hover:text-foreground`}
      >
        <ArrowLeftIcon
          className={`size-4 transition-transform ${blogEase} group-hover:-translate-x-0.5`}
        />
        Semua tulisan
      </a>

      {/* Judul memakai serif yang sama dengan heading prose → blok terasa kohesif. */}
      <h1 className="mt-8 text-balance font-heading text-[1.9rem] font-medium leading-[1.18] text-foreground sm:text-[2.4rem]">
        {post.title}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        {formatPostDate(post.publishedAt)}
        <span className="px-1.5 text-muted-foreground/40">·</span>
        {post.readingTime} menit baca
        {post.author ? (
          <>
            <span className="px-1.5 text-muted-foreground/40">·</span>
            {post.author}
          </>
        ) : null}
      </p>

      {post.cover && (
        <div className="relative mt-8 aspect-[16/9] w-full overflow-hidden rounded-xl border-2 border-border">
          <img
            src={post.cover}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        </div>
      )}
    </header>
  );
}
