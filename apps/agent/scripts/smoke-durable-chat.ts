/**
 * Smoke test DUR-1 — memverifikasi agent chat DURABLE (`createDurableAgent`) tetap kompatibel
 * dengan jalur durable-thread yang dipakai FE: `sendMessage` → run jalan server-side →
 * `subscribeToThread` mengalirkan chunk → pesan terpersist ke memory thread.
 *
 * Meniru handler `@mastra/server` PERSIS (send-message + threads/subscribe memanggil metode di
 * objek agent), tanpa HTTP/auth. Jalankan dari `apps/agent` (env `.env` ter-load otomatis oleh bun):
 *
 *   bun run scripts/smoke-durable-chat.ts
 *
 * CATATAN: memakai user pertama di DB dev + model gateway sungguhan (1 turn chat Lite — debit
 * normal_chat 1 kredit pada user tsb).
 */
import { users } from "@aqsha/db";
import { MASTRA_RESOURCE_ID_KEY, RequestContext } from "@mastra/core/request-context";
import { astraLite } from "../src/mastra/agents/astra-lite";
// Import instance Mastra agar agent ter-register (__registerMastra → pubsub/cache ter-kabel).
import { mastra } from "../src/mastra";
import { getServiceDb } from "../src/mastra/lib/db";
import { AQSHA_EMAIL_KEY } from "../src/mastra/lib/tool-context";

const TIMEOUT_MS = 150_000;

function parseParts(part: unknown): Array<{ type?: string; payload?: Record<string, unknown> }> {
  if (part && typeof part === "object") return [part as { type?: string }];
  if (typeof part !== "string") return [];
  const out: Array<{ type?: string; payload?: Record<string, unknown> }> = [];
  for (const line of part.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    try {
      out.push(JSON.parse(line.slice(6)));
    } catch {
      /* heartbeat / non-JSON */
    }
  }
  return out;
}

async function main() {
  void mastra; // side-effect import
  const db = getServiceDb();
  const [row] = await db.select({ id: users.ownerUserId }).from(users).limit(1);
  if (!row) throw new Error("tidak ada user di DB dev");
  const resourceId = row.id;
  const threadId = `smoke-dur1-${Date.now()}`;
  console.log("[smoke] resourceId:", `${resourceId.slice(0, 10)}…`, "threadId:", threadId);

  const rc = new RequestContext();
  rc.set(MASTRA_RESOURCE_ID_KEY, resourceId);
  rc.set(AQSHA_EMAIL_KEY, "");

  // 1) Subscribe DULU (paritas FE: langganan panjang, buffer replay dari index 0).
  const agent = astraLite as unknown as {
    sendMessage: (msg: string, target: Record<string, unknown>) => Promise<{
      accepted: Promise<unknown>;
    }>;
    subscribeToThread: (o: Record<string, unknown>) => Promise<{
      stream: AsyncIterable<unknown>;
      unsubscribe: () => void;
    }>;
  };
  const sub = await agent.subscribeToThread({ resourceId, threadId });
  console.log("[smoke] subscribed");

  // 2) sendMessage — persis handler server (requestContext disuntik via ifIdle.streamOptions).
  const result = await agent.sendMessage("Uji koneksi singkat: balas persis satu kata: halo", {
    resourceId,
    threadId,
    ifIdle: { streamOptions: { requestContext: rc } },
  });
  const settled = await result.accepted;
  console.log("[smoke] sendMessage accepted:", JSON.stringify(settled));

  // 3) Konsumsi stream sampai terminal (finish non-tool-calls / error / abort) atau timeout.
  const seen = new Map<string, number>();
  let text = "";
  let terminal = "";
  const timer = setTimeout(() => {
    console.error("[smoke] TIMEOUT menunggu chunk terminal");
    sub.unsubscribe();
  }, TIMEOUT_MS);
  outer: for await (const part of sub.stream) {
    for (const c of parseParts(part)) {
      if (!c.type) continue;
      seen.set(c.type, (seen.get(c.type) ?? 0) + 1);
      if (c.type === "text-delta") {
        const p = c.payload as { text?: string } | undefined;
        text += p?.text ?? "";
      }
      if (c.type === "error" || c.type === "abort") {
        terminal = c.type;
        break outer;
      }
      if (c.type === "finish") {
        const p = (c.payload ?? {}) as { stepResult?: { reason?: string }; reason?: string };
        const reason = p.stepResult?.reason ?? p.reason ?? "";
        if (reason !== "tool-calls") {
          terminal = `finish(${reason || "?"})`;
          break outer;
        }
      }
    }
  }
  clearTimeout(timer);
  sub.unsubscribe();
  console.log("[smoke] terminal:", terminal || "(stream berakhir tanpa terminal)");
  console.log("[smoke] chunk types:", JSON.stringify(Object.fromEntries(seen)));
  console.log("[smoke] text:", JSON.stringify(text.slice(0, 200)));

  const ok = terminal.startsWith("finish") && text.trim().length > 0;
  console.log(ok ? "[smoke] PASS" : "[smoke] FAIL");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("[smoke] FAILED", err);
  process.exit(1);
});
