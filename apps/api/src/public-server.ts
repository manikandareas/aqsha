import { logger } from "./lib/log";
import { initSentry } from "./lib/sentry";
import { publicApp } from "./public-app";

initSentry("api-public");

const port = Number(process.env.PORT ?? 3001);
publicApp.listen(port);
logger.info({ port, notable: true }, "public_api_started");
