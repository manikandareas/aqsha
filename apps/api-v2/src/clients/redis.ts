import { Redis } from "ioredis";

let redis: Redis | null = null;

/**
 * Lazy singleton Redis. `lazyConnect` menunda koneksi sampai command pertama,
 * dan `retryStrategy: () => null` membuat probe (/healthz) gagal cepat (redis:false)
 * alih-alih menggantung saat Redis tak terjangkau.
 */
export function getRedis(): Redis {
  if (redis) return redis;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required to connect to Redis");
  redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy: () => null,
  });
  return redis;
}

/**
 * SET key 1 EX <ttl> NX. Mengembalikan `true` bila berhasil di-set (pertama kali),
 * `false` bila key sudah ada (sudah diproses) — dasar idempotency webhook.
 */
export async function setNxWithTtl(key: string, ttlSeconds: number): Promise<boolean> {
  const res = await getRedis().set(key, "1", "EX", ttlSeconds, "NX");
  return res === "OK";
}
