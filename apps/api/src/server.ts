import { assertEmbeddingEnabled } from "@aqsha/services/rag";
import { app } from "./index";
import { logger } from "./lib/log";

// Fail-fast (D1): finalize upload meng-index dokumen via embedding. Kredensial yang hilang
// digagalkan saat boot (bukan upload "sukses" tapi tak ter-index). Di entry runtime (bukan
// index.ts) supaya import type { App } di web tetap bebas side-effect.
assertEmbeddingEnabled();

// Entry runtime (dev/start). Dipisah dari index.ts supaya import type { App } di web
// tidak menarik side-effect listen maupun Bun-only API.
const port = Number(process.env.PORT ?? 3001);
app.listen(port);
logger.info({ port }, "api listening");
