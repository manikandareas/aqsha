import { PaperReaderRoute } from "@/features/discovery/components/paper-reader";

export default async function PaperReaderPage({
  params,
}: {
  params: Promise<{ paperRef: string }>;
}) {
  const { paperRef } = await params;
  return <PaperReaderRoute paperKey={decodeURIComponent(paperRef)} />;
}
