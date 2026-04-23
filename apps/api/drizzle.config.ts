import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const command = process.argv[2];
const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/aqsha";

if (!process.env.DATABASE_URL && command !== "generate") {
  throw new Error("DATABASE_URL is required for Drizzle commands other than generate.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "../../packages/db/src/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl,
  },
});
