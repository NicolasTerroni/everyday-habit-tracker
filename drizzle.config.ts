import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config();

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  // Runtime traffic uses Neon's pooled URL. Migrations prefer the direct URL
  // because they can hold longer-lived connections and schema locks.
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? ""
  },
  strict: true,
  verbose: true
});
