// Installs or upgrades the idempotent PostgreSQL schema before Render starts
// the API. This keeps Supabase setup reproducible and avoids copying hundreds
// of lines through its SQL editor by hand.

import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { ENV, assertEnv } from "./env.js";

const here = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  assertEnv();

  // In source this file is backend/src/install-schema.ts; after compilation it
  // is backend/dist/src/install-schema.js. Resolve both layouts so the command
  // works locally and as Render's pre-deploy command.
  const repositoryRoot = path.resolve(here, here.endsWith(`${path.sep}dist${path.sep}src`) ? "../../.." : "../..");
  const schemaPath = path.join(repositoryRoot, "database", "schema.sql");
  const schema = await readFile(schemaPath, "utf8");

  const client = new pg.Client({ connectionString: ENV.databaseUrl });
  try {
    await client.connect();
    await client.query(schema);
    console.log(`CampusPulse schema installed from ${schemaPath}`);
  } finally {
    await client.end();
  }
}

main().catch(error => {
  // pg can surface connection failures as AggregateError with an empty top-level
  // message. Print the useful error fields and nested causes, but never the
  // connection string because Render logs are retained remotely.
  const details = (value: unknown): string => {
    if (!(value instanceof Error)) return String(value);

    const databaseError = value as Error & { code?: string; errors?: unknown[] };
    const ownMessage = [databaseError.code, databaseError.message].filter(Boolean).join(": ");
    const causes = databaseError.errors?.map(details).filter(Boolean) ?? [];
    return [ownMessage, ...causes].filter(Boolean).join(" | ") || value.name;
  };

  console.error("CampusPulse schema installation failed:", details(error));
  process.exit(1);
});
