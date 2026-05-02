import { createServer } from "./server";

const server = createServer();
console.log(`@aqsha/vercel-ai-sdk listening on http://${server.hostname}:${server.port}`);

export { createServer } from "./server";
