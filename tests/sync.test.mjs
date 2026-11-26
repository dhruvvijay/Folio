import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../client/ledger-sync.js", import.meta.url), "utf8");
const owner = "a".repeat(64);
const other = "b".repeat(64);
const blank = { transactions: [] };

function response(status, data) {
  return { status, ok: status >= 200 && status < 300, json: async () => data };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function harness(fetch, { expectedWorkspace = owner } = {}) {
  const document = new EventTarget();
  const window = new EventTarget();
  const states = [];
  const statuses = [];
  const validated = [];
  const calls = [];
  let storageReads = 0;
  let deviceWrites = 0;
  let unauthorized = 0;

  Object.defineProperty(window, "localStorage", {
    get() {
      storageReads++;
      throw new Error("Account clients must never access this browser’s ledger storage.");
    },
  });
  window.fetch = async (url, options) => {
    assert.equal(url, "/api/ledger");
    calls.push(options);
    return await fetch(options);
  };
  window.LedgerSchema = { validate(state) { validated.push(state); return state; } };

  vm.runInNewContext(source, { window, document, AbortController, setTimeout, clearTimeout });
  const client = window.LedgerSync.create({
    initialState: { transactions: ["legacy user"] },
    freshState: () => blank,
    hasLegacy: true,
    saveDevice() { deviceWrites++; return true; },
    accountMode: true,
    expectedWorkspace,
    onState(state, metadata) { states.push({ state, metadata }); },
    onStatus(status) { statuses.push(status); },
    onUnauthorized() { unauthorized++; },
  });

  return {
    client, states, statuses, validated, calls,
    lastState: () => states.at(-1),
    lastStatus: () => statuses.at(-1),
    unauthorized: () => unauthorized,
    assertAccountOnly() {
      assert.equal(storageReads, 0);
      assert.equal(deviceWrites, 0);
      assert.equal(client.getLegacy(), null);
      assert.equal(client.acceptLegacy(), false);
    },
  };
}

test("blocks edits until a matching account GET completes and syncs entirely in memory", async () => {
  const handshake = deferred();
  const h = harness(async request => {
    if (request.method === "GET") return await handshake.promise;
    const next = JSON.parse(request.body);
    assert.equal(next.workspace, owner);
    assert.equal(next.expectedRevision, 0);
    return response(200, { workspace: owner, revision: 1, state: next.state });
  });

  assert.equal(h.client.save({ transactions: ["early"] }), false);
  const start = h.client.start();
  assert.equal(h.client.save({ transactions: ["still waiting"] }), false);
  assert.deepEqual(h.states, []);
  handshake.resolve(response(200, { workspace: owner, revision: 0, state: null }));
  await start;
  assert.equal(h.lastState().state, blank);
  assert.equal(h.lastState().metadata.workspace, owner);
  assert.equal(h.lastStatus().phase, "synced");

  assert.equal(h.client.save({ transactions: ["new owner transaction"] }), true);
  assert.equal(h.lastStatus().pending, true);
  assert.equal(h.lastStatus().draftStored, false);
  assert.equal(await h.client.flush(), true);
  assert.equal(h.lastStatus().pending, false);
  assert.deepEqual(h.calls.map(call => call.method), ["GET", "PUT"]);
  h.assertAccountOnly();
});

test("rejects a cross-account GET before validating or displaying its state", async () => {
  const h = harness(async () => response(200, {
    workspace: other, revision: 12, state: { transactions: ["wrong account’s private data"] },
  }));

  await h.client.start();
  assert.equal(h.unauthorized(), 1);
  assert.equal(h.lastState().state, blank);
  assert.equal(h.lastState().metadata.source, "account-cleared");
  assert.equal(h.lastState().metadata.workspace, null);
  assert.equal(h.lastStatus().phase, "account-required");
  assert.equal(h.lastStatus().cloud, false);
  assert.deepEqual(h.validated, []);
  assert.equal(h.client.save({ transactions: ["undeliverable"] }), false);
  await h.client.retry();
  assert.equal(h.calls.length, 1);
  h.assertAccountOnly();
});

test("clears the active ledger and queued edits when the server rejects a changed session", async () => {
  const existing = { transactions: ["old account’s private data"] };
  const put = deferred();
  const h = harness(async request => request.method === "GET"
    ? response(200, { workspace: owner, revision: 2, state: existing })
    : await put.promise);

  await h.client.start();
  assert.equal(h.lastState().state, existing);
  assert.equal(h.client.save({ transactions: ["unconfirmed change"] }), true);
  await Promise.resolve();
  assert.equal(h.client.save({ transactions: ["also queued"] }), true);
  put.resolve(response(403, { error: "Your signed-in workspace changed." }));
  assert.equal(await h.client.flush(), false);
  assert.equal(h.unauthorized(), 1);
  assert.equal(h.lastState().state, blank);
  assert.equal(h.lastStatus().hasSnapshot, false);
  assert.equal(h.lastStatus().pending, false);
  assert.deepEqual(h.calls.map(call => call.method), ["GET", "PUT"]);
  h.assertAccountOnly();
});

test("handles sign-out during GET even when the request ignores abort", async () => {
  const handshake = deferred();
  const started = deferred();
  const h = harness(async request => {
    started.resolve(request.signal);
    return await handshake.promise;
  });

  const start = h.client.start();
  const signal = await started.promise;
  h.client.dispose();
  assert.equal(signal.aborted, true);
  assert.equal(h.lastState().state, blank);
  const closedStateCount = h.states.length;
  const closedStatusCount = h.statuses.length;
  handshake.resolve(response(200, {
    workspace: owner, revision: 1, state: { transactions: ["late private data"] },
  }));
  await start;

  assert.equal(h.states.length, closedStateCount);
  assert.equal(h.statuses.length, closedStatusCount);
  assert.equal(h.client.save({ transactions: ["too late"] }), false);
  assert.equal(h.unauthorized(), 0);
  h.assertAccountOnly();
});

test("blocks edits when the initial account handshake fails", async () => {
  const h = harness(async () => { throw new Error("Temporary network failure"); });
  await h.client.start();
  assert.equal(h.lastStatus().phase, "offline");
  assert.equal(h.lastStatus().cloud, false);
  assert.equal(h.client.save({ transactions: ["not yet authorized"] }), false);
  h.assertAccountOnly();
});

test("does not follow a redirect carrying pending ledger changes", async () => {
  const h = harness(async request => {
    if (request.method === "GET") return response(200, { workspace: owner, revision: 0, state: null });
    assert.equal(request.redirect, "manual");
    return { type: "opaqueredirect", status: 0, ok: false };
  });
  await h.client.start();
  assert.equal(h.client.save({ transactions: ["private draft"] }), true);
  assert.equal(await h.client.flush(), false);
  assert.equal(h.unauthorized(), 1);
  assert.equal(h.lastState().state, blank);
  h.assertAccountOnly();
});
