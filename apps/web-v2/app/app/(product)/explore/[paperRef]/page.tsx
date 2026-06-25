import { PaperReader } from "@/features/discovery/components/paper-reader";

export default async function PaperReaderPage({
  params,
}: {
  params: Promise<{ paperRef: string }>;
}) {
  const { paperRef } = await params;
  return <PaperReader paperKey={decodeURIComponent(paperRef)} />;
}
