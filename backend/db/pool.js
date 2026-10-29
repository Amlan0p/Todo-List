import pg from "pg";

// Builds the PostgreSQL connection pool from the DATABASE_URL environment variable.
// No credentials are hardcoded and nothing about the connection is logged.

function getConnectionString() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. See .env.example.");
  }
  // Remove "sslmode" from the URL so the SSL decision below is the single source of truth.
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("sslmode");
    return parsed.toString();
  } catch {
    return url;
  }
}

// SSL rules:
//  - DATABASE_SSL=true  -> always use SSL
//  - DATABASE_SSL=false -> never use SSL
//  - not set (auto)     -> SSL for remote hosts (Render's External URL has a dotted hostname),
//                          no SSL for localhost or Render's Internal URL (hostname without dots).
function getSslConfig(connectionString) {
  const flag = (process.env.DATABASE_SSL || "").toLowerCase();
  if (flag === "true" || flag === "1") return { rejectUnauthorized: false };
  if (flag === "false" || flag === "0") return false;

  try {
    const { hostname } = new URL(connectionString);
    const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    const isInternal = !hostname.includes(".");
    return isLocal || isInternal ? false : { rejectUnauthorized: false };
  } catch {
    return false;
  }
}

let pool;

export function getPool() {
  if (!pool) {
    const connectionString = getConnectionString();
    pool = new pg.Pool({
      connectionString,
      ssl: getSslConfig(connectionString),
      max: Number(process.env.DB_POOL_MAX) || 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });

    // Idle clients can error (e.g. the database restarts). Log it instead of crashing.
    pool.on("error", (err) => {
      console.error("Unexpected PostgreSQL pool error:", err.message);
    });
  }
  return pool;
}

export function query(text, params) {
  return getPool().query(text, params);
}

export async function closePool() {
  if (pool) {
    const p = pool;
    pool = undefined;
    await p.end();
  }
}
