import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ base: "./src/content/blog", pattern: "**/*.mdx" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    publishedAt: z.coerce.date(),
    updated: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    cover: z.string().optional(),
    author: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

const changelog = defineCollection({
  loader: glob({ base: "./src/content/changelog", pattern: "**/*.mdx" }),
  schema: z.object({
    title: z.string(),
    publishedAt: z.coerce.date(),
    version: z.string().optional(),
    categories: z
      .array(z.enum(["baru", "peningkatan", "perbaikan"]))
      .default([]),
    summary: z.string().optional(),
    preview: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog, changelog };
