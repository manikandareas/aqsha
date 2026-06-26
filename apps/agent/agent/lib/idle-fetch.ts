/**
 * Wrap a `fetch` so the request aborts when the server sends NO bytes for `idleMs`.
 *
 * KENAPA ADA: model Lite jalan via endpoint OpenAI-compatible (deepseek/gateway). Saat
 * koneksi streaming-nya STALL di tengah (server berhenti kirim token tapi koneksi tak
 * ditutup), `streamText` eve menggantung SELAMANYA — batas step/turn eve dicek ANTAR
 * step, jadi tak pernah memutus satu panggilan model yang hang. Observed: /deep beku >15
 * menit tanpa progress (lihat audit). Idle-timeout di lapisan `fetch` provider = satu-
 * satunya titik yang bisa memutus hang itu → jadi error turn yang retryable, bukan beku.
 *
 * IDLE, bukan TOTAL: timer hanya jalan saat kita MENUNGGU server (`reader.read()` pending)
 * dan dimatikan begitu satu chunk tiba — jadi stream lambat-tapi-maju TAK pernah dibunuh,
 * dan backpressure sisi-konsumen (AI SDK memproses chunk) tak memicu abort.
 */
export function withIdleTimeout(baseFetch: typeof fetch, idleMs: number): typeof fetch {
  const wrapped: typeof fetch = async (input, init) => {
    const controller = new AbortController();
    const signal = init?.signal
      ? AbortSignal.any([init.signal, controller.signal])
      : controller.signal;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      timer = setTimeout(
        () => controller.abort(new Error(`model stream idle > ${idleMs}ms`)),
        idleMs,
      );
    };
    const disarm = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };

    arm(); // cover connect + headers (TTFB)
    let res: Response;
    try {
      res = await baseFetch(input, { ...init, signal });
    } catch (err) {
      disarm();
      throw err;
    }
    disarm();
    if (!res.body) return res;

    const reader = res.body.getReader();
    const guarded = new ReadableStream<Uint8Array>({
      async pull(ctrl) {
        arm(); // idle clock for THIS chunk's server-wait only
        try {
          const result = await reader.read();
          disarm(); // server responded → stop clock before the consumer processes
          if (result.done) {
            ctrl.close();
            return;
          }
          ctrl.enqueue(result.value);
        } catch (err) {
          disarm();
          ctrl.error(err);
        }
      },
      cancel(reason) {
        disarm();
        return reader.cancel(reason);
      },
    });
    return new Response(guarded, {
      headers: res.headers,
      status: res.status,
      statusText: res.statusText,
    });
  };
  return wrapped;
}
