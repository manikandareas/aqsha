import { app } from "./index";
import { logger } from "./lib/log";

// Entry runtime (dev/start). Dipisah dari index.ts supaya import type { App } di web-v2
// tidak menarik side-effect listen maupun Bun-only API.
const port = Number(process.env.PORT ?? 3001);
app.listen(port);
logger.info({ port }, "api-v2 listening");
