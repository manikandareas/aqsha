import type { allPosts } from 'content-collections';

/** Satu post blog hasil Content Collections (frontmatter + computed fields). */
export type BlogPost = (typeof allPosts)[number];
