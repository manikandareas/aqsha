import { runMigrations } from "./migrator";

// Entry untuk `db:migrate` (bun run src/migrate.ts).
await runMigrations();
console.log("migrations applied");
