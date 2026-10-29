import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { getPool, closePool } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Creates the tables if they don't exist. Never drops or modifies existing data.
// Runs inside a transaction, and an advisory lock stops two instances
// starting at the same time from racing each other.
export async function runMigrations() {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(727274)");
    await client.query(sql);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Allows: npm run migrate
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  dotenv.config();
  runMigrations()
    .then(() => console.log("Database schema is up to date."))
    .catch((err) => {
      console.error("Migration failed:", err.message);
      process.exitCode = 1;
    })
    .finally(closePool);
}
