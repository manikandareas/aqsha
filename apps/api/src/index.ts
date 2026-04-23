import { app } from "./app";
import { env } from "./config";

app.listen(env.API_PORT);

console.log(
  `API running at http://${app.server?.hostname ?? "localhost"}:${env.API_PORT}`,
);
