import type { allChangelogs } from 'content-collections';

/** Satu entri changelog hasil Content Collections (frontmatter + computed fields). */
export type ChangelogEntry = (typeof allChangelogs)[number];

/** Salah satu kategori perubahan: "baru" | "peningkatan" | "perbaikan". */
export type ChangelogCategory = ChangelogEntry['categories'][number];
