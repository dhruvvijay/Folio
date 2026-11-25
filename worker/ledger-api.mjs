const FOLIO_AUTH_HEADER = "oai-authenticated-user-id";
const FOLIO_HOSTED_ORIGIN = "https://folio-finance-studio.dazzlingfoam8.chatgpt.site";

function ledgerJson(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: {
      ...headers,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function folioWorkspaceFor(identity) {
  const material = new TextEncoder().encode(`folio:ledger-owner:v1\0${identity}`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function readFolioSnapshot(db, workspace) {
  const row = await db.prepare("SELECT revision, state FROM folio_ledgers WHERE workspace = ?")
    .bind(workspace)
    .first();
  return row
    ? { workspace, revision: row.revision, state: JSON.parse(row.state) }
    : { workspace, revision: 0, state: null };
}

const folioAllowedOrigin = request => {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  return origin === new URL(request.url).origin || origin === FOLIO_HOSTED_ORIGIN;
};

async function readFolioBody(request, maxBytes) {
  const declaredBytes = Number(request.headers.get("Content-Length"));
  if (declaredBytes > maxBytes) return { status: 413, error: "This ledger exceeds the maximum upload size." };
  const reader = request.body?.getReader();
  if (!reader) return { status: 400, error: "Send a JSON ledger request." };

  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0;
  let body = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        void reader.cancel().catch(() => {});
        return { status: 413, error: "This ledger exceeds the maximum upload size." };
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return { payload: JSON.parse(body) };
  } catch {
    return { status: 400, error: "Send valid UTF-8 JSON for the ledger." };
  } finally {
    reader.releaseLock();
  }
}

async function putFolioSnapshot(db, workspace, expectedRevision, state) {
  const encoded = JSON.stringify(state);
  if (expectedRevision === 0) {
    return db.prepare(`
      INSERT INTO folio_ledgers (workspace, revision, state, updated_at)
      VALUES (?, 1, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(workspace) DO NOTHING
      RETURNING revision
    `).bind(workspace, encoded).first();
  }
  return db.prepare(`
    UPDATE folio_ledgers
    SET revision = revision + 1, state = ?, updated_at = CURRENT_TIMESTAMP
    WHERE workspace = ? AND revision = ?
    RETURNING revision
  `).bind(encoded, workspace, expectedRevision).first();
}

export async function ledgerResponse(request, env) {
  if (request.method !== "GET" && request.method !== "PUT") {
    return ledgerJson({ error: "Method not allowed." }, 405, { Allow: "GET, PUT" });
  }
  const identity = request.headers.get(FOLIO_AUTH_HEADER)?.trim();
  if (!identity) return ledgerJson({ error: "Sign in to access your synced ledger." }, 401);
  if (request.method === "PUT" && !folioAllowedOrigin(request)) {
    return ledgerJson({ error: "Open this workspace directly before saving." }, 403);
  }
  if (!env?.DB) return ledgerJson({ error: "Sync is temporarily unavailable." }, 503);

  const workspace = await folioWorkspaceFor(identity);
  if (request.method === "GET") {
    try {
      return ledgerJson(await readFolioSnapshot(env.DB, workspace));
    } catch {
      return ledgerJson({ error: "Sync is temporarily unavailable." }, 503);
    }
  }
  const contentType = request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return ledgerJson({ error: "Send the ledger with an application/json content type." }, 415);
  }
  const schema = globalThis.LedgerSchema;
  const parsed = await readFolioBody(request, schema.MAX_BYTES + 1024);
  if (parsed.status) return ledgerJson({ error: parsed.error }, parsed.status);
  const payload = parsed.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return ledgerJson({ error: "Send a ledger and its current revision." }, 400);
  }
  if (payload.workspace !== workspace) {
    return ledgerJson({ error: "Your signed-in workspace changed. Refresh before saving." }, 403);
  }
  const { expectedRevision } = payload;
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) {
    return ledgerJson({ error: "Send a valid ledger revision." }, 400);
  }

  let state;
  try {
    state = schema.validate(payload.state);
  } catch (error) {
    return ledgerJson({ error: error instanceof Error ? error.message : "The ledger is invalid." }, 422);
  }
  try {
    const saved = await putFolioSnapshot(env.DB, workspace, expectedRevision, state);
    if (saved) return ledgerJson({ workspace, revision: saved.revision, state });

    const current = await readFolioSnapshot(env.DB, workspace);
    return ledgerJson({ ...current, error: "This ledger was updated on another device." }, 409);
  } catch {
    return ledgerJson({ error: "Sync is temporarily unavailable." }, 503);
  }
}
