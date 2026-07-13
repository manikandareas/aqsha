import { createPageMetadata } from "@/lib/metadata";
import { ChangelogList } from "@/features/changelog/components/changelog-list";
import { publishedEntries } from "@/features/changelog/lib/entries";

export const metadata = createPageMetadata({
  title: "Apa yang baru",
  description:
    "Fitur baru, peningkatan, dan perbaikan terbaru di Aqsha — asisten AI buat riset yang sumbernya beneran dicek.",
  path: "/changelog",
});

export default function ChangelogPage() {
  return <ChangelogList entries={publishedEntries()} />;
}
