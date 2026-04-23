import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "@aqsha/db/schema";
import { env } from "../config";

export const database = drizzle(env.DATABASE_URL, { schema });

export type DatabaseClient = typeof database;
