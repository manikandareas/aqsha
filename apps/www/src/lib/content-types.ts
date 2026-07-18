export type ChangelogCategory = "baru" | "peningkatan" | "perbaikan";

export type ChangelogEntry = {
  id: string;
  slug: string;
  url: string;
  title: string;
  publishedAt: string;
  version?: string;
  categories: ChangelogCategory[];
  summary?: string;
  preview?: string;
  draft: boolean;
  excerpt: string;
  heroTag?: string;
  heroTitle?: string;
};

export type BlogPost = {
  id: string;
  slug: string;
  url: string;
  title: string;
  description?: string;
  publishedAt: string;
  updated?: string;
  tags: string[];
  cover?: string;
  author?: string;
  draft: boolean;
  readingTime: number;
  excerpt: string;
};
