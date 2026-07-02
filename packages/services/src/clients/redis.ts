import { Redis } from "ioredis";

/**
 * Redis singleton untuk `@aqsha/services`. Dipakai modul quota
 * (`rate-limiter-flexible`) yang hidup di service layer supaya bisa dipanggil
 * BAIK dari api MAUPUN agent (runtime Mastra, via dist build). `ioredis` =
 * npm terkompilasi → aman di-bundle/externalize.
 *
 * `lazyConnect` + `retryStrategy: () => null` = fail-fast (sama pola api): saat Redis
 * tak terjangkau, command reject cepat alih-alih menggantung — penting karena quota
 * macro fail-OPEN saat store error.
 */
let redis: Redis | null = null;

export function getServiceRedis(): Redis {
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
