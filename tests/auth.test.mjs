import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createAuth } from "../portable/auth.mjs";
import { getDatabase } from "../portable/database.mjs";

const origin = "https://finance.test";
const password = "Test-only password one";
const newPassword = "Test-only password two";
const thirdPassword = "Test-only password three";

async function setup(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "folio-auth-"));
  const database = await getDatabase({ FOLIO_SQLITE_PATH: path.join(directory, "test.sqlite") });
  t.after(async () => {
    await database.close();
    await rm(directory, { recursive: true, force: true });
  });
  const auth = await createAuth({ origin, database });
  return { auth, database };
}

function buildRequest(route, { method = "GET", body, cookie, headers = {}, raw } = {}) {
  const request = new Request(`${origin}${route}`, {
    method,
    headers: {
      ...(method === "GET" ? {} : { Origin: origin, "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
      "X-Folio-Client-Key": "test-socket",
      ...headers,
    },
    ...(raw !== undefined ? { body: raw } : body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return request;
}

async function hit(auth, route, options) {
  const response = await auth.handle(buildRequest(`/api/auth/${route}`, options));
  assert.ok(response);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  return { status: response.status, headers: response.headers, payload: await response.json() };
}

function sessionCookie(result) {
  const header = result.headers.get("set-cookie");
  assert.match(header, /^__Host-folio_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Secure; Max-Age=604800$/u);
  return header.split(";")[0];
}

const workspaceFor = id => createHash("sha256").update(`folio:ledger-owner:v1\0${id}`).digest("hex");

test("Folio account changes isolate ledgers, hash secrets, and revoke old sessions", async t => {
  const { auth, database } = await setup(t);
  assert.equal(await auth.handle(buildRequest("/api/ledger")), null);
  assert.deepEqual((await hit(auth, "session")).payload, { user: null });
  const signup = await hit(auth, "signup", {
    method: "POST",
    body: { email: "  Test.User+Banking@Example.Test ", name: "  Nila  ", password },
  });
  assert.equal(signup.status, 201);
  assert.match(signup.payload.recoveryCode, /^[A-Za-z0-9_-]{32}$/u);
  const user = signup.payload.user;
  assert.equal(user.email, "test.user+banking@example.test");
  assert.equal(user.name, "Nila");
  assert.deepEqual(Object.keys(user).sort(), ["createdAt", "email", "id", "name"]);

  const firstCookie = sessionCookie(signup);
  const { rows: sessions } = await database.query("SELECT token_hash, expires_at, created_at FROM folio_sessions WHERE user_id = ?", [user.id]);
  const token = firstCookie.slice(firstCookie.indexOf("=") + 1);
  assert.equal(sessions[0].token_hash, createHash("sha256").update(token).digest("hex"));
  assert.equal(Number(sessions[0].expires_at) - Number(sessions[0].created_at), 604800000);
  const { rows: users } = await database.query("SELECT password_hash, recovery_hash FROM folio_users WHERE id = ?", [user.id]);
  for (const field of ["password_hash", "recovery_hash"]) {
    assert.match(users[0][field], /^scrypt-v1:[0-9a-f]{32}:[0-9a-f]{64}$/u);
  }
  const profile = await hit(auth, "profile", { method: "PATCH", body: { name: "𠮷田 梨花" }, cookie: firstCookie });
  assert.equal(profile.payload.user.name, "𠮷田 梨花");

  const login = await hit(auth, "login", { method: "POST", body: { email: user.email, password } });
  assert.equal(login.status, 200);
  const secondCookie = sessionCookie(login);
  assert.equal((await hit(auth, "session", { cookie: secondCookie })).payload.user.id, user.id);
  const duplicate = `${secondCookie}; ${firstCookie}`;
  assert.equal((await hit(auth, "session", { cookie: duplicate })).payload.user, null);
  assert.equal(await database.transaction(tx => auth.authenticate(buildRequest("/api/ledger", { cookie: secondCookie }), tx)).then(value => value.id), user.id);

  const changed = await hit(auth, "password", {
    method: "POST", cookie: firstCookie, body: { currentPassword: password, newPassword },
  });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.payload.recoveryCode, signup.payload.recoveryCode);
  const thirdCookie = sessionCookie(changed);
  assert.equal((await hit(auth, "session", { cookie: firstCookie })).payload.user, null);
  assert.equal((await hit(auth, "session", { cookie: secondCookie })).payload.user, null);
  assert.equal((await hit(auth, "session", { cookie: thirdCookie })).payload.user.id, user.id);

  const regenerated = await hit(auth, "recovery-code", {
    method: "POST", cookie: thirdCookie, body: { currentPassword: newPassword },
  });
  assert.equal(regenerated.status, 200);
  const oldRecovery = await hit(auth, "recovery", {
    method: "POST", body: { email: user.email, recoveryCode: changed.payload.recoveryCode, newPassword: thirdPassword },
  });
  assert.equal(oldRecovery.status, 401);
  const recovered = await hit(auth, "recovery", {
    method: "POST", body: { email: user.email, recoveryCode: regenerated.payload.recoveryCode, newPassword: thirdPassword },
  });
  assert.equal(recovered.status, 200);
  assert.notEqual(regenerated.payload.recoveryCode, recovered.payload.recoveryCode);
  assert.equal((await hit(auth, "session", { cookie: thirdCookie })).payload.user, null);

  const other = await hit(auth, "signup", {
    method: "POST", body: { email: "other@example.test", name: "Other", password },
  });
  const otherCookie = sessionCookie(other);
  const workspaces = [workspaceFor(user.id), workspaceFor(other.payload.user.id)];
  for (const workspace of workspaces) {
    await database.query("INSERT INTO folio_ledgers (workspace, revision, state, updated_at) VALUES (?, 1, ?, ?)",
      [workspace, "{}", new Date().toISOString()]);
  }

  const restored = await hit(auth, "login", { method: "POST", body: { email: user.email, password: thirdPassword } });
  const restoredCookie = sessionCookie(restored);
  const deleted = await hit(auth, "account", {
    method: "DELETE", cookie: restoredCookie, body: { password: thirdPassword },
  });
  assert.equal(deleted.status, 200);
  assert.match(deleted.headers.get("set-cookie"), /Max-Age=0/u);
  assert.deepEqual((await database.query("SELECT workspace FROM folio_ledgers")).rows, [{ workspace: workspaces[1] }]);
  assert.equal((await hit(auth, "session", { cookie: restoredCookie })).payload.user, null);
  assert.equal((await hit(auth, "session", { cookie: otherCookie })).payload.user.id, other.payload.user.id);
});

test("Folio auth enforces its origin, request limit, and persistent rate limit", async t => {
  const { auth, database } = await setup(t);
  const post = { method: "POST", body: { email: "missing@example.test", password: "too short" } };
  assert.equal((await hit(auth, "login", { ...post, headers: { Origin: "https://elsewhere.test" } })).status, 403);
  assert.equal((await hit(auth, "login", { ...post, headers: { "Sec-Fetch-Site": "cross-site" } })).status, 403);
  assert.equal((await hit(auth, "login", { ...post, headers: { "Content-Type": "text/plain" } })).status, 415);
  assert.equal((await hit(auth, "login", { method: "POST", raw: " ".repeat(16 * 1024 + 1) })).status, 413);
  assert.equal((await hit(auth, "login", { method: "POST", raw: "[]" })).status, 400);
  assert.equal((await hit(auth, "login", { method: "GET" })).status, 405);
  assert.equal((await hit(auth, "missing-route")).status, 404);
  for (let index = 0; index < 12; index++) {
    assert.equal((await hit(auth, "login", post)).status, 401);
  }
  const newerService = await createAuth({ origin, database });
  const throttled = await hit(newerService, "login", post);
  assert.equal(throttled.status, 429);
  assert.ok(Number(throttled.headers.get("Retry-After")) > 0);
  const { rows } = await database.query('SELECT "key" FROM folio_auth_limits');
  assert.ok(rows.length > 0);
  assert.ok(rows.every(row => /^[0-9a-f]{64}$/u.test(row.key)));
});

test("Folio logout, logout-everywhere, and server-side expiry reject stale cookies", async t => {
  const { auth, database } = await setup(t);
  const email = "logout@example.test";
  const signup = await hit(auth, "signup", { method: "POST", body: { email, name: "Logout", password } });
  const oldest = sessionCookie(signup);
  const openSession = () => hit(auth, "login", { method: "POST", body: { email, password } }).then(sessionCookie);
  const second = await openSession();
  const third = await openSession();
  const expiredHash = createHash("sha256").update(oldest.split("=")[1]).digest("hex");
  await database.query("UPDATE folio_sessions SET expires_at = 0 WHERE token_hash = ?", [expiredHash]);
  assert.equal((await hit(auth, "session", { cookie: oldest })).payload.user, null);
  await hit(auth, "logout", { method: "POST", body: {}, cookie: second });
  assert.equal((await hit(auth, "session", { cookie: second })).payload.user, null);
  assert.equal((await hit(auth, "session", { cookie: third })).payload.user.id, signup.payload.user.id);
  const fourth = await openSession();
  const revoked = await hit(auth, "logout-all", { method: "POST", body: {}, cookie: third });
  assert.equal(revoked.status, 200);
  assert.equal((await hit(auth, "session", { cookie: third })).payload.user, null);
  assert.equal((await hit(auth, "session", { cookie: fourth })).payload.user, null);
});
