import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { getDatabase } from "../portable/database.mjs";

const email = "sample@example.invalid";
const time = 1_800_000_000_000;
const account = `INSERT INTO folio_users (id, email, name, password_hash, recovery_hash, created_at, updated_at)
  VALUES (?, ?, 'Test User', 'password-hash-fixture', 'recovery-hash-fixture', '2026-11-25', '2026-11-25')`;
const session = `INSERT INTO folio_sessions (token_hash, user_id, version, expires_at, created_at)
  VALUES ('session-hash-fixture', ?, 1, ?, ?)`;

test("Render and external-database deployments refuse an ephemeral SQLite fallback", async () => {
  await assert.rejects(getDatabase({ RENDER: "true" }), /Set DATABASE_URL/);
  await assert.rejects(getDatabase({ FOLIO_REQUIRE_POSTGRES: "true" }), /Set DATABASE_URL/);
});

async function temporaryConfig(testContext) {
  const directory = await mkdtemp(join(tmpdir(), "folio-database-test-"));
  const databasePath = join(directory, "folio.sqlite");
  const connections = [];
  testContext.after(async () => {
    try {
      await Promise.all(connections.map(database => database.close()));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  return {
    databasePath,
    async connect() {
      const database = await getDatabase({ FOLIO_SQLITE_PATH: databasePath });
      connections.push(database);
      return database;
    },
  };
}

test("portable accounts migrate an existing SQLite ledger once and preserve its workspace", async t => {
  const { databasePath, connect } = await temporaryConfig(t);
  const originalSchema = await readFile(new URL("../drizzle/0000_create_folio_ledgers.sql", import.meta.url), "utf8");
  const original = new DatabaseSync(databasePath);
  try {
    original.exec(originalSchema);
    original.prepare("INSERT INTO folio_ledgers VALUES (?, ?, ?, CURRENT_TIMESTAMP)").run("legacy-workspace", 7, "{}");
  } finally {
    original.close();
  }

  const first = await connect();
  assert.equal(await first.check(), true);
  await first.close();
  const upgraded = await connect();
  const row = await upgraded.DB.prepare("SELECT workspace, revision, state FROM folio_ledgers WHERE workspace = ?")
    .bind("legacy-workspace").first();
  assert.deepEqual(row, { workspace: "legacy-workspace", revision: 7, state: "{}" });
  assert.deepEqual(await upgraded.query("SELECT version FROM folio_portable_migrations"), { rows: [{ version: 1 }] });
  assert.deepEqual(await upgraded.query("SELECT id FROM folio_users"), { rows: [] });
});

test("a pending SQLite transaction excludes ledger reads, queries, and transactions on the same file", async t => {
  const { connect } = await temporaryConfig(t);
  const [primary, secondary] = await Promise.all([connect(), connect()]);
  const entered = Promise.withResolvers();
  const resume = Promise.withResolvers();
  const work = primary.transaction(async tx => {
    await tx.query("INSERT INTO folio_ledgers VALUES (?, 1, ?, CURRENT_TIMESTAMP)", ["test-workspace", "{}"]);
    entered.resolve();
    await resume.promise;
    await tx.query("UPDATE folio_ledgers SET revision = 2 WHERE workspace = ?", ["test-workspace"]);
  });
  void work.catch(entered.reject);

  let completed = 0;
  const pending = [];
  try {
    await entered.promise;
    pending.push(
      primary.query("SELECT revision FROM folio_ledgers"),
      secondary.DB.prepare("SELECT revision FROM folio_ledgers WHERE workspace = ?").bind("test-workspace").first(),
      secondary.transaction(tx => tx.query("SELECT revision FROM folio_ledgers")),
    );
    for (const query of pending) void query.then(() => { completed += 1; }, () => { completed += 1; });
    await setImmediate();
    assert.equal(completed, 0);
  } finally {
    resume.resolve();
    await Promise.allSettled([work, ...pending]);
  }
  await work;
  assert.deepEqual(await Promise.all(pending), [{ rows: [{ revision: 2 }] }, { revision: 2 }, { rows: [{ revision: 2 }] }]);
});

test("SQLite account writes roll back together and deleting an account cascades to its sessions", async t => {
  const { connect } = await temporaryConfig(t);
  const database = await connect();
  let escaped;
  await assert.rejects(database.transaction(async tx => {
    escaped = tx;
    await tx.query(account, ["test-user", email]);
    await tx.query(session, ["test-user", time, time]);
    throw new Error("intentional rollback");
  }), /intentional rollback/);
  await assert.rejects(escaped.query("SELECT 1"), /transaction has ended/);
  assert.deepEqual(await database.query("SELECT id FROM folio_users"), { rows: [] });
  await assert.rejects(database.query(session, ["missing-user", time, time]), /foreign key/i);

  await database.transaction(async tx => {
    await tx.query(account, ["test-user", email]);
    await tx.query(session, ["test-user", time, time]);
  });
  await assert.rejects(database.query(account, ["different-user", email]), /unique/i);
  assert.deepEqual(await database.query("SELECT expires_at FROM folio_sessions"), { rows: [{ expires_at: time }] });
  await database.query("DELETE FROM folio_users WHERE id = ?", ["test-user"]);
  assert.deepEqual(await database.query("SELECT token_hash FROM folio_sessions"), { rows: [] });
});
