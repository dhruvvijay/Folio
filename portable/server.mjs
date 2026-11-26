import { once } from "node:events";
import { createServer } from "node:http";
import { isIP } from "node:net";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import folioWorker from "../dist/server/index.js";
import { createAuth } from "./auth.mjs";
import { getDatabase } from "./database.mjs";

const hopByHop = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailer", "transfer-encoding", "upgrade",
]);

function readConfiguration(env) {
  const siteUrl = env.FOLIO_ORIGIN || env.RENDER_EXTERNAL_URL || "http://localhost:8080";
  let url;
  try {
    url = new URL(siteUrl);
  } catch {
    throw new Error("Set FOLIO_ORIGIN to the app URL.");
  }
  const validUrl = (url.protocol === "http:" || url.protocol === "https:")
    && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
  if (!validUrl || (!env.FOLIO_ORIGIN && env.RENDER_EXTERNAL_URL && url.protocol !== "https:")) {
    throw new Error("Set FOLIO_ORIGIN to an HTTP or HTTPS origin with no path. Render requires HTTPS.");
  }

  const port = Number(env.PORT ?? 8080);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("Set PORT to an integer TCP port.");
  }
  return { origin: url.origin, port };
}

function targetUrl(value, origin) {
  if (!value?.startsWith("/")) return null;
  try {
    const target = new URL(value, origin);
    return target.origin === origin && !target.hash ? target : null;
  } catch {
    return null;
  }
}

function hasCanonicalHost(req, publicUrl) {
  const host = req.headers.host;
  if (!host || req.headersDistinct.host?.length !== 1 || /[\s/\\@?#,]/u.test(host)) return false;
  try {
    return new URL(`${publicUrl.protocol}//${host}`).origin === publicUrl.origin;
  } catch {
    return false;
  }
}

function plainResponse(req, res, status, message, headers = {}) {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(req.method === "HEAD" ? undefined : message);
}

function readiness(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    plainResponse(req, res, 405, "Method not allowed.\n", { Allow: "GET, HEAD" });
    return;
  }
  // The server starts listening only after its database migration succeeds.
  // Routine host probes must not wake a serverless database or consume its
  // free compute allowance while there are no customer requests.
  plainResponse(req, res, 200, "OK\n");
}

function incomingBody(req) {
  const chunks = req.iterator({ destroyOnReturn: false });
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await chunks.next();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      // A rejected upload can still receive its HTTP response on this connection.
      try {
        await chunks.return();
      } finally {
        req.resume();
      }
    },
  });
}

function workerRequest(req, target, publicUrl, env) {
  const headers = new Headers();
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    const name = req.rawHeaders[index].toLowerCase();
    if (hopByHop.has(name) || name === "authorization" || name === "oai-sites-authorization" || name === "x-folio-client-key"
        || name.startsWith("oai-authenticated-") || name === "forwarded" || name.startsWith("x-forwarded-")) continue;
    headers.append(name, req.rawHeaders[index + 1]);
  }
  if (headers.get("origin") !== publicUrl.origin) headers.delete("origin");
  headers.set("host", publicUrl.host);
  // Render's public ingress overwrites CF-Connecting-IP. Trust it only on Render;
  // self-hosted installations use the socket and ignore arbitrary proxy headers.
  const renderClient = req.headers["cf-connecting-ip"];
  const trustedClient = env.RENDER === "true" && typeof renderClient === "string"
    && req.headersDistinct["cf-connecting-ip"]?.length === 1 && isIP(renderClient);
  headers.set("x-folio-client-key", trustedClient ? renderClient : req.socket.remoteAddress || "unknown");
  const method = req.method;
  const options = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    options.body = incomingBody(req);
    options.duplex = "half";
  }
  return new Request(target, options);
}

async function sendWorkerResponse(response, res) {
  for (const [name, value] of response.headers) {
    if (name !== "set-cookie" && !hopByHop.has(name)) res.setHeader(name, value);
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length) res.setHeader("Set-Cookie", cookies);
  res.statusCode = response.status;
  if (!response.body) {
    res.end();
    return;
  }
  await pipeline(Readable.fromWeb(response.body), res);
}

export async function startServer(env = process.env, {
  databaseFactory = getDatabase,
  authFactory = createAuth,
} = {}) {
  const { origin, port } = readConfiguration(env);
  const publicUrl = new URL(origin);
  const database = await databaseFactory(env);
  let auth;
  try {
    auth = await authFactory({ env, origin, database });
  } catch (error) {
    await database.close();
    throw error;
  }

  async function handle(req, res) {
    const target = targetUrl(req.url, origin);
    if (target?.pathname === "/healthz") {
      readiness(req, res);
      return;
    }
    if (!hasCanonicalHost(req, publicUrl)) {
      plainResponse(req, res, 421, "Use the configured Folio URL.\n");
      return;
    }
    if (!target) {
      plainResponse(req, res, 400, "Invalid request target.\n");
      return;
    }
    if (req.method === "TRACE" || req.method === "TRACK") {
      plainResponse(req, res, 405, "Method not allowed.\n");
      return;
    }

    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (publicUrl.protocol === "https:") res.setHeader("Strict-Transport-Security", "max-age=31536000");
    let request = workerRequest(req, target, publicUrl, env);
    const authResponse = await auth.handle(request);
    if (authResponse) {
      await sendWorkerResponse(authResponse, res);
      return;
    }
    if (target.pathname === "/api/ledger") {
      const user = await auth.authenticate(request);
      if (!user) {
        await sendWorkerResponse(Response.json({ error: "Sign in to access your ledger." }, {
          status: 401, headers: { "Cache-Control": "private, no-store" },
        }), res);
        return;
      }
      // Finish bounded uploads before acquiring a database transaction or user lock.
      if (request.body) {
        const maxBytes = globalThis.LedgerSchema.MAX_BYTES + 1024;
        const reader = request.body.getReader();
        const chunks = [];
        let size = 0;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) {
              await reader.cancel();
              plainResponse(req, res, 413, "This ledger exceeds the maximum upload size.\n");
              return;
            }
            chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }
        request = new Request(request.url, {
          method: request.method, headers: request.headers, body: Buffer.concat(chunks, size),
        });
      }
      const response = await database.transaction(async tx => {
        // Serialize ledger reads/writes with account deletion and credential changes.
        const locked = await tx.query("UPDATE folio_users SET updated_at = updated_at WHERE id = ? RETURNING id", [user.id]);
        const current = locked.rows.length ? await auth.authenticate(request, tx) : null;
        if (!current || current.id !== user.id) {
          return Response.json({ error: "Your session ended. Sign in again." }, {
            status: 401, headers: { "Cache-Control": "private, no-store" },
          });
        }
        const headers = new Headers(request.headers);
        headers.set("oai-authenticated-user-id", current.id);
        headers.delete("cookie");
        headers.delete("x-folio-client-key");
        const trustedRequest = new Request(request, { headers });
        const DB = {
          prepare(sql) {
            return { bind: (...parameters) => ({ first: async () => (await tx.query(sql, parameters)).rows[0] ?? null }) };
          },
        };
        return folioWorker.fetch(trustedRequest, { DB });
      });
      await sendWorkerResponse(response, res);
      return;
    }
    if (target.pathname === "/login" || target.pathname === "/login/") {
      target.pathname = "/login.html";
      request = new Request(target, { method: request.method, headers: request.headers });
    }
    const response = await folioWorker.fetch(request, {});
    await sendWorkerResponse(response, res);
  }

  const server = createServer({ headersTimeout: 15_000, requestTimeout: 30_000 }, (req, res) => {
    void handle(req, res).catch(() => {
      if (res.destroyed || res.writableEnded) return;
      if (res.headersSent) {
        res.destroy();
        return;
      }
      plainResponse(req, res, 500, "The request could not be completed.\n");
    });
  });

  try {
    const listening = once(server, "listening");
    server.listen(port, "0.0.0.0");
    await listening;
  } catch (error) {
    await database.close();
    throw error;
  }

  let closing;
  function close() {
    closing ??= (async () => {
      const deadline = setTimeout(() => server.closeAllConnections(), 10_000);
      deadline.unref();
      try {
        await new Promise((resolve, reject) => {
          server.close(error => error ? reject(error) : resolve());
        });
      } finally {
        clearTimeout(deadline);
        await database.close();
      }
    })();
    return closing;
  }
  return { server, origin, close };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { server, close } = await startServer();
    console.log(`Folio is listening on port ${server.address().port}.`);
    for (const signal of ["SIGTERM", "SIGINT"]) {
      process.once(signal, () => {
        void close().catch(() => {
          console.error("Folio could not shut down cleanly.");
          process.exitCode = 1;
        });
      });
    }
  } catch {
    console.error("Folio could not start. Check its origin, port, and database settings.");
    process.exitCode = 1;
  }
}
