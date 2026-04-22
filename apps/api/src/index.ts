import { app } from "./app";
import { apiPort } from "./config";

app.listen(apiPort);

console.log(`API running at http://${app.server?.hostname ?? "localhost"}:${apiPort}`);
