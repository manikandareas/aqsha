import { api } from "@/lib/api";

// Selalu fetch fresh supaya refresh meng-update serverTime (bukti rail live).
export const dynamic = "force-dynamic";

export default async function Home() {
  const { data, error } = await api.ping.get();
  const serverTime = data?.serverTime ?? null;

  return (
    <main className="grid min-h-svh place-items-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-3 px-6 text-center">
        <p className="font-serif text-4xl">Aqsha V2</p>
        <p className="text-sm text-muted-foreground">
          Foundations rail · waktu server api-v2 via Eden Treaty
        </p>
        {serverTime !== null ? (
          <p className="font-mono text-lg tabular-nums">
            serverTime: {serverTime}
            <br />
            {new Date(serverTime).toISOString()}
          </p>
        ) : (
          <p className="font-mono text-sm text-destructive">
            api-v2 tak terjangkau
            {error ? ` (status ${String(error.status ?? "unknown")})` : ""}
          </p>
        )}
      </div>
    </main>
  );
}
