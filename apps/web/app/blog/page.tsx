import { allPosts } from "content-collections";

import { createPageMetadata } from "@/lib/metadata";
import { BlogList } from "@/features/blog/components/blog-list";

export const metadata = createPageMetadata({
  title: "Blog",
  description:
    "Catatan tim Aqsha soal riset, verifikasi sumber, dan cara nulis ilmiah yang sumbernya beneran ada.",
  path: "/blog",
});

export default function BlogIndexPage() {
  const posts = allPosts
    .filter((post) => !post.draft)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  return <BlogList posts={posts} />;
}
