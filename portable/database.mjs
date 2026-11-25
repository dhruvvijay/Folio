import { constants } from "node:fs";
import { mkdir, open, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const migrationFile = new URL("../drizzle/0000_create_folio_ledgers.sql", import.meta.url);
const healthQuery = "SELECT workspace, revision, state, updated_at FROM folio_ledgers LIMIT 0";

function normalizeRow(row) {
  if (!row) return null;
  const result = { ...row };
  if (Object.hasOwn(result, "revision")) {
    const revision = Number(result.revision);
    if (!Number.isSafeInteger(revision) || revision < 1) {
      throw new Error("The stored ledger revision is invalid.");
    }
    result.revision = revision;
  }
  return result;
}

async function openSQLite(path, schema) {
  const { DatabaseSync } = await import("node:sqlite");
  const filename = resolve(path || "/data/folio.sqlite");
  await mkdir(dirname(filename), { recursive: true, mode: 0o700 });
  const flags = constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW | constants.O_NONBLOCK;
  const file = await open(filename, flags, 0o600);
  try {
    if (!(await file.stat()).isFile()) throw new Error("The SQLite path must be a regular file.");
    await file.chmod(0o600);
  } finally {
    await file.close();
  }

  const connection = new DatabaseSync(filename);
  try {
    connection.exec("PRAGMA busy_timeout = 5000");
    const journal = connection.prepare("PRAGMA journal_mode = WAL").get();
    if (journal.journal_mode !== "wal") throw new Error("SQLite could not enable WAL mode.");
    connection.exec("PRAGMA synchronous = FULL");
    connection.exec("BEGIN IMMEDIATE");
    connection.exec(schema);
    connection.exec("COMMIT");
    connection.prepare(healthQuery).all();
  } catch (error) {
    // Closing the connection also rolls back an interrupted migration.
    connection.close();
    throw error;
  }

  let closed = false;
  return {
    DB: {
      prepare(sql) {
        const statement = connection.prepare(sql);
        return {
          bind(...parameters) {
            return { first: async () => normalizeRow(statement.get(...parameters)) };
          },
        };
      },
    },
    async check() {
      connection.prepare(healthQuery).all();
      return true;
    },
    async close() {
      if (closed) return;
      connection.close();
      closed = true;
    },
  };
}

async function migratePostgres(pool, schema) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '10s'");
    // Serialize this migration when several Folio instances start together.
    await client.query("SELECT pg_advisory_xact_lock(1179601993, 79)");
    await client.query(schema.replaceAll("`", '"').replace('"revision" integer', '"revision" bigint'));
    await client.query(healthQuery);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function openPostgres(connectionString, schema) {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !(url.hostname || url.searchParams.get("host"))) {
    throw new Error("DATABASE_URL must be a PostgreSQL URL.");
  }
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 5000, query_timeout: 15000 });
  // Pool failures surface through readiness or the next database request.
  pool.on("error", () => {});
  try {
    await migratePostgres(pool, schema);
  } catch (error) {
    await pool.end().catch(() => {});
    throw error;
  }

  let closing;
  return {
    DB: {
      prepare(sql) {
        let index = 0;
        // The shared ledger API uses ? only as a parameter marker in its fixed queries.
        const query = sql.replaceAll("?", () => `$${++index}`);
        return {
          bind(...parameters) {
            return {
              async first() {
                const { rows } = await pool.query(query, parameters);
                return normalizeRow(rows[0]);
              },
            };
          },
        };
      },
    },
    async check() {
      await pool.query(healthQuery);
      return true;
    },
    close() {
      closing ??= pool.end();
      return closing;
    },
  };
}

export async function getDatabase(env = process.env) {
  const postgres = Boolean(env.DATABASE_URL);
  try {
    const migration = await readFile(migrationFile, "utf8");
    const schema = migration.replace(/^CREATE TABLE\b/u, "CREATE TABLE IF NOT EXISTS");
    return postgres ? await openPostgres(env.DATABASE_URL, schema) : await openSQLite(env.FOLIO_SQLITE_PATH, schema);
  } catch (error) {
    const code = typeof error?.code === "string" && /^[A-Z0-9_]{1,32}$/u.test(error.code) ? ` (${error.code})` : "";
    const location = postgres ? "PostgreSQL. Check DATABASE_URL and database access" : "SQLite. Check FOLIO_SQLITE_PATH and file access";
    throw new Error(`Folio could not initialize ${location}${code}.`);
  }
}
