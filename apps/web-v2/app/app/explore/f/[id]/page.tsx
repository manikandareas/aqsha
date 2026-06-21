import { FactReader } from "@/features/discovery/components/fact-reader";

export default async function FactReaderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FactReader id={id} />;
}
