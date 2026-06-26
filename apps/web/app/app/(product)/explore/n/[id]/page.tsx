import { NewsReader } from "@/features/discovery/components/news-reader";

export default async function NewsReaderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <NewsReader id={id} />;
}
