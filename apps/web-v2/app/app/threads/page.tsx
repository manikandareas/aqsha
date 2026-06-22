import { NewChat } from "@/features/threads/components/new-chat";

/**
 * Percakapan baru (live). Turn pertama → URL bump ke `/app/threads/<id>`.
 * `?seed=` mengisi composer sekali (Fase 8: Tanya Astra / idea→/deep dari discovery).
 */
export default async function NewThreadPage({
  searchParams,
}: {
  searchParams: Promise<{ seed?: string }>;
}) {
  const { seed } = await searchParams;
  return <NewChat seed={typeof seed === "string" ? seed : undefined} />;
}
