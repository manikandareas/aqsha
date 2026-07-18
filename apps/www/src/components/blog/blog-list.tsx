import { BlogCard } from "@/components/blog/blog-card";
import { blogColumn, blogGutter } from "@/lib/blog/layout";
import type { BlogPost } from "@/lib/blog/types";

export function BlogList({ posts }: { posts: BlogPost[] }) {
  return (
    <main className={`${blogColumn} py-14 sm:py-20`}>
      <header className={`${blogGutter} animate-in fade-in fill-mode-both duration-500`}>
        <h1 className="font-heading text-[1.9rem] font-medium leading-tight text-foreground sm:text-[2.25rem]">
          Blog
        </h1>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Catatan tim Aqsha soal riset, verifikasi sumber, dan cara nulis ilmiah
          yang sumbernya beneran ada.
        </p>
      </header>

      {posts.length === 0 ? (
        <p className={`${blogGutter} mt-10 text-sm text-muted-foreground`}>
          Belum ada tulisan. Nantikan, ya.
        </p>
      ) : (
        <div className="mt-8 divide-y divide-border/60 border-y border-border/60">
          {posts.map((post, index) => (
            <BlogCard key={post.slug} post={post} index={index} />
          ))}
        </div>
      )}
    </main>
  );
}
