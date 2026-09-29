import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// A syntactically valid fallback lets `next build` collect routes before Vercel
// injects runtime secrets. Any real request still requires DATABASE_URL.
const connectionString = process.env.DATABASE_URL ?? "postgresql://build:build@localhost/build";
const pool = new Pool({ connectionString, max: 3 });
export const db = drizzle(pool, { schema });
