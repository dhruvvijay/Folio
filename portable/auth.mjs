import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { domainToASCII } from "node:url";
import { promisify } from "node:util";

const derive = promisify(scrypt);
const scryptOptions = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const digestLength = 32;
const saltLength = 16;
const maxRequestBytes = 16 * 1024;
const hour = 60 * 60 * 1000;
const sessionDuration = 7 * 24 * hour;
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
const controlCharacter = /[\u0000-\u001f\u007f-\u009f]/u;
const opaqueSession = /^[A-Za-z0-9_-]{43}$/u;
const opaqueRecovery = /^[A-Za-z0-9_-]{32}$/u;
const sessionFields = "u.id, u.email, u.name, u.created_at, u.password_hash, u.recovery_hash, u.session_version";
const userFields = "id, email, name, created_at, password_hash, recovery_hash, session_version";
const failure = "Those credentials could not be verified.";
const staleSession = "Your session changed. Sign in again.";

class AuthProblem extends Error {
  constructor(status, message, headers = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

function reply(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function makeDigest(secret) {
  const salt = randomBytes(saltLength);
  const digest = await derive(secret, salt, digestLength, scryptOptions);
  return `scrypt-v1:${salt.toString("hex")}:${digest.toString("hex")}`;
}

async function matchesDigest(secret, encoded) {
  const [version, salt, digest] = encoded.split(":");
  if (version !== "scrypt-v1" || !/^[0-9a-f]{32}$/u.test(salt) || !/^[0-9a-f]{64}$/u.test(digest)) return false;
  const actual = await derive(secret, Buffer.from(salt, "hex"), digestLength, scryptOptions);
  const equal = timingSafeEqual(actual, Buffer.from(digest, "hex"));
  actual.fill(0);
  return equal;
}

function emailValue(value) {
  if (typeof value !== "string" || value.length > 320 || !value.isWellFormed()) return null;
  const email = value.trim().toLowerCase();
  const separator = email.lastIndexOf("@");
  if (separator < 1 || separator > 64 || email.length > 254) return null;
  const local = email.slice(0, separator);
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/u.test(local) || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  const domainName = email.slice(separator + 1);
  if (!/^[\p{L}\p{M}\p{N}.-]+$/u.test(domainName)) return null;
  const domain = domainToASCII(domainName);
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label))) return null;
  return local.length + domain.length < 254 ? `${local}@${domain}` : null;
}

function passwordValue(value) {
  if (typeof value !== "string" || value.length > 256 || !value.isWellFormed() || !value.trim() || controlCharacter.test(value)) return null;
  const length = Array.from(value).length;
  return length >= 12 && length <= 128 ? value : null;
}

function requirePassword(value) {
  const password = passwordValue(value);
  if (!password) throw new AuthProblem(400, "Use a password with 12 to 128 characters.");
  return password;
}

function requireName(value) {
  const name = typeof value === "string" && value.length <= 160 && value.isWellFormed() ? value.trim().normalize("NFC") : "";
  if (!name || Array.from(name).length > 80 || controlCharacter.test(name)) {
    throw new AuthProblem(400, "Enter a name with 1 to 80 characters.");
  }
  return name;
}

function publicUser(row) {
  return { id: row.id, email: row.email, name: row.name, createdAt: row.created_at };
}

function tokenHash(request, cookieName) {
  const cookies = request.headers.get("cookie")?.split(";") ?? [];
  const matches = cookies.map(cookie => cookie.trim()).filter(cookie => cookie.startsWith(`${cookieName}=`));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(cookieName.length + 1);
  return opaqueSession.test(token) ? hash(token) : null;
}

async function parsePayload(request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new AuthProblem(415, "Send the request as JSON.");
  }
  if (Number(request.headers.get("content-length")) > maxRequestBytes) {
    throw new AuthProblem(413, "The request is too large.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new AuthProblem(400, "Send a JSON request.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxRequestBytes) {
        void reader.cancel().catch(() => {});
        throw new AuthProblem(413, "The request is too large.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const body = JSON.parse(text);
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch (error) {
    if (error instanceof AuthProblem) throw error;
  } finally {
    reader.releaseLock();
  }
  throw new AuthProblem(400, "Send a valid JSON object.");
}

const windows = {
  signup: { milliseconds: hour, socket: 60, email: 8, paired: 5 },
  login: { milliseconds: 15 * 60 * 1000, socket: 150, email: 24, paired: 12 },
  recovery: { milliseconds: hour, socket: 60, email: 8, paired: 6 },
  account: { milliseconds: 15 * 60 * 1000, socket: 100, email: 20, paired: 12 },
};

async function reserveAttempt(db, key, limit, now, milliseconds) {
  const until = now + milliseconds;
  const result = await db.query(`
    INSERT INTO folio_auth_limits ("key", count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT ("key") DO UPDATE SET
      count = CASE WHEN folio_auth_limits.expires_at <= ? THEN 1 ELSE folio_auth_limits.count + 1 END,
      expires_at = CASE WHEN folio_auth_limits.expires_at <= ? THEN excluded.expires_at ELSE folio_auth_limits.expires_at END
    WHERE folio_auth_limits.expires_at <= ? OR folio_auth_limits.count < ?
    RETURNING expires_at
  `, [key, until, now, now, now, limit]);
  if (result.rows.length) return;
  const known = await db.query('SELECT expires_at FROM folio_auth_limits WHERE "key" = ?', [key]);
  const retry = Math.max(1, Math.ceil((Number(known.rows[0]?.expires_at ?? until) - now) / 1000));
  throw new AuthProblem(429, "Too many attempts. Wait and try again.", { "Retry-After": String(retry) });
}

async function checkAttempts(db, action, request, subject) {
  const settings = windows[action];
  const now = Date.now();
  const clientKey = request.headers.get("x-folio-client-key")?.slice(0, 128) || "unknown";
  const bucket = (scope, ...items) => hash(JSON.stringify(["folio:auth-attempt:v1", action, scope, ...items]));
  await reserveAttempt(db, bucket("socket", clientKey), settings.socket, now, settings.milliseconds);
  if (!subject) return;
  await reserveAttempt(db, bucket("pair", subject, clientKey), settings.paired, now, settings.milliseconds);
  await reserveAttempt(db, bucket("account", subject), settings.email, now, settings.milliseconds);
}

async function findUser(db, email) {
  return (await db.query(`SELECT ${userFields} FROM folio_users WHERE email = ?`, [email])).rows[0] ?? null;
}

async function lookupSession(db, key) {
  if (!key) return null;
  const result = await db.query(`
    SELECT ${sessionFields}, s.token_hash
    FROM folio_sessions AS s JOIN folio_users AS u ON s.user_id = u.id
    WHERE s.token_hash = ? AND s.version = u.session_version AND s.expires_at > ?
  `, [key, Date.now()]);
  return result.rows[0] ?? null;
}

async function createSession(db, user) {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  const result = await db.query(`
    INSERT INTO folio_sessions (token_hash, user_id, version, expires_at, created_at)
    SELECT ?, id, session_version, ?, ? FROM folio_users
    WHERE id = ? AND session_version = ? AND password_hash = ?
    RETURNING token_hash
  `, [hash(token), now + sessionDuration, now, user.id, user.session_version, user.password_hash]);
  if (!result.rows.length) throw new AuthProblem(401, staleSession);
  return token;
}

function changeProof(user) {
  return [user.id, user.session_version, user.password_hash, user.recovery_hash];
}

const proof = "id = ? AND session_version = ? AND password_hash = ? AND recovery_hash = ?";
const liveToken = "EXISTS (SELECT 1 FROM folio_sessions WHERE token_hash = ? AND user_id = folio_users.id AND expires_at > ?)";

async function rotateCredentials(db, user, password, renewSession) {
  const recoveryCode = randomBytes(24).toString("base64url");
  const [passwordHash, recoveryHash] = await Promise.all([makeDigest(password), makeDigest(recoveryCode)]);
  const cookieToken = await db.transaction(async tx => {
    const sessionCheck = renewSession ? ` AND ${liveToken}` : "";
    const sessionValues = renewSession ? [user.token_hash, Date.now()] : [];
    const updated = await tx.query(`
      UPDATE folio_users SET password_hash = ?, recovery_hash = ?, session_version = session_version + 1, updated_at = ?
      WHERE ${proof}${sessionCheck} RETURNING session_version
    `, [passwordHash, recoveryHash, new Date().toISOString(), ...changeProof(user), ...sessionValues]);
    if (!updated.rows.length) throw new AuthProblem(401, renewSession ? staleSession : failure);
    await tx.query("DELETE FROM folio_sessions WHERE user_id = ?", [user.id]);

    return renewSession ? createSession(tx, {
      id: user.id, session_version: updated.rows[0].session_version, password_hash: passwordHash,
    }) : null;
  });
  return { recoveryCode, cookieToken };
}

export async function createAuth({ env = process.env, origin, database } = {}) {
  const base = new URL(origin ?? env.FOLIO_ORIGIN ?? "http://localhost:8080");
  const secure = base.protocol === "https:";
  if (!secure && (base.protocol !== "http:" || !loopbackHosts.has(base.hostname))) {
    throw new Error("FOLIO_ORIGIN must use HTTPS unless its hostname is localhost or a loopback address.");
  }
  if (!database?.query || !database?.transaction) throw new Error("Folio accounts need a database.");
  const cookieName = secure ? "__Host-folio_session" : "folio_session";
  const cookieFlags = `Path=/; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
  const dummy = await makeDigest(randomBytes(32).toString("base64url"));
  let nextCleanup = 0;

  function setCookie(token) {
    const expiry = token ? `Max-Age=${sessionDuration / 1000}` : "Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT";
    return { "Set-Cookie": `${cookieName}=${token ?? ""}; ${cookieFlags}; ${expiry}` };
  }

  async function authenticate(request, db = database) {
    const user = await lookupSession(db, tokenHash(request, cookieName));
    return user ? publicUser(user) : null;
  }

  async function requireSession(request) {
    const user = await lookupSession(database, tokenHash(request, cookieName));
    if (!user) throw new AuthProblem(401, "Sign in to manage your account.");
    return user;
  }

  async function verifyCurrentPassword(request, user, value) {
    await checkAttempts(database, "account", request, user.id);
    const password = passwordValue(value);
    if (!password || !(await matchesDigest(password, user.password_hash))) {
      throw new AuthProblem(401, "The current password could not be verified.");
    }
  }

  async function cleanup() {
    const now = Date.now();
    if (now < nextCleanup) return;
    nextCleanup = now + hour;
    try {
      await database.query("DELETE FROM folio_sessions WHERE expires_at <= ?", [now]);
      await database.query("DELETE FROM folio_auth_limits WHERE expires_at <= ?", [now]);
    } catch {
      nextCleanup = now + 5 * 60 * 1000;
    }
  }

  const routes = {
    session: ["GET", async request => reply({ user: await authenticate(request) })],
    signup: ["POST", async (request, body) => {
      const email = emailValue(body.email);
      await checkAttempts(database, "signup", request, email);
      if (!email) throw new AuthProblem(400, "Enter a valid email address.");
      const name = requireName(body.name);
      const password = requirePassword(body.password);
      const recoveryCode = randomBytes(24).toString("base64url");
      const [passwordHash, recoveryHash] = await Promise.all([makeDigest(password), makeDigest(recoveryCode)]);
      const userId = randomUUID();
      const now = new Date().toISOString();
      const { user, token } = await database.transaction(async tx => {
        const result = await tx.query(`
          INSERT INTO folio_users (id, email, name, password_hash, recovery_hash, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (email) DO NOTHING RETURNING ${userFields}
        `, [userId, email, name, passwordHash, recoveryHash, now, now]);
        const user = result.rows[0];
        if (!user) throw new AuthProblem(409, "Could not create an account with those details. Try signing in.");
        return { user, token: await createSession(tx, user) };
      });
      return reply({ user: publicUser(user), recoveryCode }, 201, setCookie(token));
    }],
    login: ["POST", async (request, body) => {
      const email = emailValue(body.email);
      await checkAttempts(database, "login", request, email);
      const password = passwordValue(body.password);
      if (!email || !password) throw new AuthProblem(401, failure);
      const user = await findUser(database, email);
      const match = await matchesDigest(password, user?.password_hash ?? dummy);
      if (!user || !match) throw new AuthProblem(401, failure);
      return reply({ user: publicUser(user) }, 200, setCookie(await createSession(database, user)));
    }],
    logout: ["POST", async request => {
      const key = tokenHash(request, cookieName);
      if (key) await database.query("DELETE FROM folio_sessions WHERE token_hash = ?", [key]);
      return reply({ ok: true }, 200, setCookie(null));
    }],
    profile: ["PATCH", async (request, body) => {
      const user = await requireSession(request);
      const name = requireName(body.name);
      const result = await database.query(`
        UPDATE folio_users SET name = ?, updated_at = ?
        WHERE id = ? AND session_version = ? AND ${liveToken}
        RETURNING id, email, name, created_at
      `, [name, new Date().toISOString(), user.id, user.session_version, user.token_hash, Date.now()]);
      if (!result.rows.length) throw new AuthProblem(401, staleSession);
      return reply({ user: publicUser(result.rows[0]) });
    }],
    password: ["POST", async (request, body) => {
      const user = await requireSession(request);
      const password = requirePassword(body.newPassword);
      await verifyCurrentPassword(request, user, body.currentPassword);
      const updated = await rotateCredentials(database, user, password, true);
      return reply({ ok: true, recoveryCode: updated.recoveryCode }, 200, setCookie(updated.cookieToken));
    }],
    recovery: ["POST", async (request, body) => {
      const email = emailValue(body.email);
      const code = typeof body.recoveryCode === "string" ? body.recoveryCode.trim() : "";
      await checkAttempts(database, "recovery", request, email);
      const password = requirePassword(body.newPassword);
      if (!email || !opaqueRecovery.test(code)) throw new AuthProblem(401, failure);
      const user = await findUser(database, email);
      const match = await matchesDigest(code, user?.recovery_hash ?? dummy);
      if (!user || !match) throw new AuthProblem(401, failure);
      const updated = await rotateCredentials(database, user, password, false);
      return reply({ ok: true, recoveryCode: updated.recoveryCode }, 200, setCookie(null));
    }],
    "recovery-code": ["POST", async (request, body) => {
      const user = await requireSession(request);
      await verifyCurrentPassword(request, user, body.currentPassword);
      const recoveryCode = randomBytes(24).toString("base64url");
      const recoveryHash = await makeDigest(recoveryCode);
      const result = await database.query(`
        UPDATE folio_users SET recovery_hash = ?, updated_at = ?
        WHERE ${proof} AND ${liveToken} RETURNING id
      `, [recoveryHash, new Date().toISOString(), ...changeProof(user), user.token_hash, Date.now()]);
      if (!result.rows.length) throw new AuthProblem(401, staleSession);
      return reply({ recoveryCode });
    }],
    account: ["DELETE", async (request, body) => {
      const user = await requireSession(request);
      await verifyCurrentPassword(request, user, body.password);
      const workspace = hash(`folio:ledger-owner:v1\0${user.id}`);
      await database.transaction(async tx => {
        const result = await tx.query(`
          DELETE FROM folio_users WHERE ${proof} AND ${liveToken} RETURNING id
        `, [...changeProof(user), user.token_hash, Date.now()]);
        if (!result.rows.length) throw new AuthProblem(401, staleSession);
        await tx.query("DELETE FROM folio_ledgers WHERE workspace = ?", [workspace]);
      });
      return reply({ ok: true }, 200, setCookie(null));
    }],
    "logout-all": ["POST", async request => {
      const user = await requireSession(request);
      await database.transaction(async tx => {
        const result = await tx.query(`
          UPDATE folio_users SET session_version = session_version + 1, updated_at = ?
          WHERE id = ? AND session_version = ? AND ${liveToken} RETURNING id
        `, [new Date().toISOString(), user.id, user.session_version, user.token_hash, Date.now()]);
        if (!result.rows.length) throw new AuthProblem(401, staleSession);
        await tx.query("DELETE FROM folio_sessions WHERE user_id = ?", [user.id]);
      });
      return reply({ ok: true }, 200, setCookie(null));
    }],
  };

  async function handle(request) {
    const url = new URL(request.url);
    const prefix = "/api/auth/";
    if (!url.pathname.startsWith(prefix)) return null;
    const action = url.pathname.slice(prefix.length);
    if (!Object.hasOwn(routes, action)) return reply({ error: "Account endpoint not found." }, 404);
    const [method, handler] = routes[action];
    if (request.method !== method) return reply({ error: "Method not allowed." }, 405, { Allow: method });
    if (url.origin !== base.origin || request.headers.get("sec-fetch-site")?.toLowerCase() === "cross-site"
        || (method !== "GET" && request.headers.get("origin") !== base.origin)) {
      return reply({ error: "Open Folio directly before managing your account." }, 403);
    }
    try {
      const body = method === "GET" ? undefined : await parsePayload(request);
      await cleanup();
      return await handler(request, body);
    } catch (error) {
      if (error instanceof AuthProblem) return reply({ error: error.message }, error.status, error.headers);
      return reply({ error: "Accounts are temporarily unavailable." }, 503);
    }
  }

  return { handle, authenticate };
}
