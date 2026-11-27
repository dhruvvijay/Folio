import { chmod, lstat, mkdir, open, readFile, realpath } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

const ledgerMigration = new URL("../drizzle/0000_create_folio_ledgers.sql", import.meta.url);
const accountsMigration = new URL("./migrations/001_accounts.sql", import.meta.url);
const sqliteMutexes = new Map();
const healthQuery = `
  SELECT l.workspace, l.revision, l.state, l.updated_at,
         u.id, u.email, u.name, u.password_hash, u.recovery_hash, u.session_version, u.created_at, u.updated_at,
         s.token_hash, s.user_id, s.version, s.expires_at, s.created_at,
         a."key", a.count, a.expires_at
  FROM folio_ledgers l
  CROSS JOIN folio_users u
  CROSS JOIN folio_sessions s
  CROSS JOIN folio_auth_limits a
  LIMIT 0
`;

function ledgerBinding(query) {
  return {
    prepare(sql) {
      return {
        bind(...parameters) {
          return {
            async first() {
              const { rows } = await query(sql, parameters);
              const row = rows[0];
              if (!row) return null;
              if (Object.hasOwn(row, "revision")) {
                const revision = Number(row.revision);
                if (!Number.isSafeInteger(revision) || revision < 1) {
                  throw new Error("The stored ledger revision is invalid.");
                }
                return { ...row, revision };
              }
              return row;
            },
          };
        },
      };
    },
  };
}

async function withTransaction(query, begin, work, rollbackFailed = () => {}) {
  let active = false;
  const transaction = {
    async query(sql, parameters = []) {
      if (!active) throw new Error("This database transaction has ended.");
      return query(sql, parameters);
    },
  };

  try {
    await query(begin);
    active = true;
    const result = await work(transaction);
    active = false;
    await query("COMMIT");
    return result;
  } catch (error) {
    active = false;
    await query("ROLLBACK").catch(rollbackFailed);
    throw error;
  }
}

async function applyMigrations(query, runScript, schemas) {
  await runScript(schemas.ledgers);
  await query("CREATE TABLE IF NOT EXISTS folio_portable_migrations (version INTEGER PRIMARY KEY NOT NULL)");
  const { rows } = await query("SELECT version FROM folio_portable_migrations WHERE version = ?", [1]);
  if (!rows.length) {
    await runScript(schemas.accounts);
    await query("INSERT INTO folio_portable_migrations (version) VALUES (?)", [1]);
  }
  if (!(await query("SELECT version FROM folio_portable_migrations WHERE version = ?", [2])).rows.length) {
    await runScript(schemas.trips);
    await query("INSERT INTO folio_portable_migrations (version) VALUES (?)", [2]);
  }
  if (!(await query("SELECT version FROM folio_portable_migrations WHERE version = ?", [3])).rows.length) {
    await runScript(schemas.plans);
    await query("INSERT INTO folio_portable_migrations (version) VALUES (?)", [3]);
  }
  await query(healthQuery);
}

function acquireSQLiteMutex(filename) {
  let mutex = sqliteMutexes.get(filename);
  if (!mutex) {
    mutex = { references: 0, tail: Promise.resolve() };
    sqliteMutexes.set(filename, mutex);
  }
  mutex.references += 1;
  return {
    run(work) {
      const next = mutex.tail.then(work);
      mutex.tail = next.catch(() => {});
      return next;
    },
    release() {
      mutex.references -= 1;
      if (mutex.references === 0) sqliteMutexes.delete(filename);
    },
  };
}

async function secureSQLiteFile(filename) {
  try {
    const file = await open(filename, "wx", 0o600);
    await file.close();
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const file = await lstat(filename);
  if (!file.isFile()) throw new Error("The SQLite path must be a regular file.");
  if ((file.mode & 0o7777) !== 0o600) await chmod(filename, 0o600);
}

async function openSQLite(path, schemas) {
  const { DatabaseSync } = await import("node:sqlite");
  const target = resolve(path || "/data/folio.sqlite");
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const filename = join(await realpath(dirname(target)), basename(target));
  const mutex = acquireSQLiteMutex(filename);

  let connection;
  // The public query acquires the mutex. Transaction queries use this connection
  // directly while the transaction already owns the mutex.
  async function execute(sql, parameters = []) {
    const rows = connection.prepare(sql).all(...parameters);
    return { rows: rows.map(row => ({ ...row })) };
  }

  try {
    await mutex.run(async () => {
      await secureSQLiteFile(filename);
      connection = new DatabaseSync(filename);
      try {
        connection.exec("PRAGMA busy_timeout = 5000");
        connection.exec("PRAGMA foreign_keys = ON");
        const journal = connection.prepare("PRAGMA journal_mode = WAL").get();
        if (journal.journal_mode !== "wal") throw new Error("SQLite could not enable WAL mode.");
        connection.exec("PRAGMA synchronous = FULL");
        await withTransaction(execute, "BEGIN IMMEDIATE", transaction => (
          applyMigrations(transaction.query, script => connection.exec(script), schemas)
        ));
      } catch (error) {
        connection.close();
        throw error;
      }
    });
  } catch (error) {
    mutex.release();
    throw error;
  }

  const query = (sql, parameters) => mutex.run(() => execute(sql, parameters));

  let closing;
  return {
    DB: ledgerBinding(query),
    query,
    transaction(work) {
      return mutex.run(() => withTransaction(execute, "BEGIN IMMEDIATE", work));
    },
    async check() {
      await query(healthQuery);
      return true;
    },
    close() {
      closing ??= mutex.run(() => {
        try {
          connection.close();
        } finally {
          mutex.release();
        }
      });
      return closing;
    },
  };
}

function postgresQuery(client) {
  return async (sql, parameters = []) => {
    // Folio's application-owned SQL uses question marks only for parameters.
    let index = 0;
    const query = sql.replaceAll("?", () => `$${++index}`);
    const { rows } = await client.query(query, parameters);
    return { rows };
  };
}

async function postgresTransaction(pool, work) {
  const client = await pool.connect();
  let badConnection;
  try {
    return await withTransaction(postgresQuery(client), "BEGIN", work, error => {
      badConnection = error;
    });
  } finally {
    client.release(badConnection);
  }
}

function safeBigInt(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("A database integer is out of range.");
  return parsed;
}

async function openPostgres(connectionString, schemas) {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !(url.hostname || url.searchParams.get("host"))) {
    throw new Error("DATABASE_URL must be a PostgreSQL URL.");
  }
  const { Pool, types } = await import("pg");
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: 5000,
    query_timeout: 15000,
    types: {
      getTypeParser(oid, format) {
        return oid === types.builtins.INT8 && format !== "binary" ? safeBigInt : types.getTypeParser(oid, format);
      },
    },
  });
  // Pool failures surface through readiness or the next database request.
  pool.on("error", () => {});
  try {
    await postgresTransaction(pool, async transaction => {
      await transaction.query("SET LOCAL lock_timeout = '10s'");
      // Serialize schema upgrades when several app instances start together.
      await transaction.query("SELECT pg_advisory_xact_lock(1179601993, 79)");
      const ledgers = schemas.ledgers.replaceAll("`", '"').replace('"revision" integer', '"revision" bigint');
      await applyMigrations(transaction.query, transaction.query, { ...schemas, ledgers });
    });
  } catch (error) {
    await pool.end().catch(() => {});
    throw error;
  }

  const query = postgresQuery(pool);
  let closing;
  return {
    DB: ledgerBinding(query),
    query,
    transaction: work => postgresTransaction(pool, work),
    async check() {
      await query(healthQuery);
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
  if (!postgres && (env.RENDER === "true" || env.FOLIO_REQUIRE_POSTGRES === "true")) {
    throw new Error("Set DATABASE_URL to a persistent PostgreSQL database before starting Folio on this host.");
  }
  try {
    const [ledgers, accounts, trips, plans] = await Promise.all([
      readFile(ledgerMigration, "utf8"),
      readFile(accountsMigration, "utf8"),
      readFile(new URL("./migrations/002_trips.sql", import.meta.url), "utf8"),
      readFile(new URL("./migrations/003_trip_plans.sql", import.meta.url), "utf8"),
    ]);
    const schemas = { ledgers: ledgers.replace(/^CREATE TABLE\b/u, "CREATE TABLE IF NOT EXISTS"), accounts, trips, plans };
    return postgres ? await openPostgres(env.DATABASE_URL, schemas) : await openSQLite(env.FOLIO_SQLITE_PATH, schemas);
  } catch (error) {
    const code = typeof error?.code === "string" && /^[A-Z0-9_]{1,32}$/u.test(error.code) ? ` (${error.code})` : "";
    const location = postgres ? "PostgreSQL. Check DATABASE_URL and database access" : "SQLite. Check FOLIO_SQLITE_PATH and file access";
    throw new Error(`Folio could not initialize ${location}${code}.`);
  }
}
