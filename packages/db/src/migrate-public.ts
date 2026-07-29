import { runPublicMigrations } from "./migrator";

await runPublicMigrations();
console.log("public migrations applied");
