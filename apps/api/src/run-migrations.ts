import { Pool } from "pg";

import { loadAppEnv } from "./env.js";
import { getDefinedMigrations, runPendingMigrations } from "./migrations.js";

loadAppEnv();

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run database migrations.");
}

const pool = new Pool({
  connectionString: databaseUrl
});

try {
  const result = await runPendingMigrations(pool);
  const total = getDefinedMigrations().length;

  console.log(
    `[db:migrate] applied=${result.applied.length} alreadyApplied=${result.alreadyApplied.length} total=${total}`
  );

  if (result.applied.length > 0) {
    for (const migration of result.applied) {
      console.log(`[db:migrate] applied ${migration.id} ${migration.name}`);
    }
  } else {
    console.log("[db:migrate] no pending migrations");
  }
} finally {
  await pool.end();
}
