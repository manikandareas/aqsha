import { createPageMetadata } from "@/lib/metadata";
import { BlogList } from "@/features/blog/components/blog-list";
import { publishedPosts } from "@/features/blog/lib/posts";

export const metadata = createPageMetadata({
  title: "Blog",
  description:
    "Catatan tim Aqsha soal riset, verifikasi sumber, dan cara nulis ilmiah yang sumbernya beneran ada.",
  path: "/blog",
});

export default function BlogIndexPage() {
  return <BlogList posts={publishedPosts()} />;
}
