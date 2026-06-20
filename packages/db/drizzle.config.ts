import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    // drizzle-kit generate tidak konek DB; migrate/studio butuh DATABASE_URL.
    // Bun auto-load packages/db/.env saat menjalankan script di workspace ini.
    url: process.env.DATABASE_URL ?? "postgresql://aqsha:aqsha@localhost:5432/aqsha",
  },
});
