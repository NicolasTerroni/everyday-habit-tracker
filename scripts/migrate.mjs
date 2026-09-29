import { resolve } from "node:path";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

async function main() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to apply database migrations.");
  }

  const pool = new pg.Pool({ connectionString, max: 1 });

  try {
    await migrate(drizzle(pool), { migrationsFolder: resolve("drizzle") });
    console.log("Database migrations are up to date.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Database migration failed.", error);
  process.exitCode = 1;
});
