import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import vm from "node:vm";

const scripts = Object.fromEntries(["ledger-data.js", "charts.js", "app.js"].map(name => [
  name, readFileSync(new URL(`../client/${name}`, import.meta.url), "utf8"),
]));
const user = { id: "agent-test-owner", name: "Example Owner", email: "owner@example.test" };
const workspace = createHash("sha256").update(`folio:ledger-owner:v1\0${user.id}`).digest("hex");

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

class TestElement extends EventTarget {
  innerHTML = "";
  hidden = false;
  isConnected = false;
  classList = new Set();

  constructor() {
    super();
    this.classList.remove = value => this.classList.delete(value);
    this.classList.toggle = (value, force) => force ? this.classList.add(value) : this.classList.delete(value);
  }

  before(node) { node.isConnected = true; }
  remove() { this.isConnected = false; }
  replaceChildren() { this.innerHTML = ""; }
  querySelector() { return null; }
}

function harness(ready) {
  const window = new EventTarget();
  const document = new EventTarget();
  const nodes = new Map([
    "#main", "#sidebar", "#topbar", "#dialog", ".app-shell", ".scrim", "#csv-picker", "#backup-picker", "#toast", ".skip-link",
  ].map(selector => [selector, new TestElement()]));
  const gate = new TestElement();
  const redirects = [];
  const connect = deferred();
  const opened = deferred();
  const location = {
    hash: "",
    replace(path) { redirects.push(path); },
    reload() { redirects.push("reload"); },
  };
  let disposed = 0;
  let storageCalls = 0;
  let invalidated = 0;
  document.querySelector = selector => nodes.get(selector) || null;
  document.createElement = () => gate;
  window.crypto = webcrypto;
  window.LedgerAssistant = { canExplain: async () => false };
  window.FolioAccount = {
    user, ready, registerCleanup() {},
    invalidate() { invalidated++; },
  };
  window.LedgerSync = { create(options) {
    opened.resolve(options);
    return {
      start: () => connect.promise,
      dispose() { disposed++; },
    };
  } };

  const sandbox = vm.createContext({ window, document, location, TextEncoder, setTimeout, clearTimeout });
  vm.runInContext(scripts["ledger-data.js"], sandbox);
  vm.runInContext(scripts["charts.js"], sandbox);
  const storageCheck = () => { storageCalls++; throw new Error("Account boot must not use the legacy ledger."); };
  window.LedgerData = { ...window.LedgerData, today: () => "2026-11-26", read: storageCheck, hasSavedState: storageCheck, save: storageCheck };
  vm.runInContext(scripts["app.js"], sandbox);

  return {
    window, nodes, gate, redirects, connect, opened,
    shell: nodes.get(".app-shell"), main: nodes.get("#main"),
    stats: () => ({ disposed, storageCalls, invalidated }),
    mount(options, description) {
      const state = options.freshState();
      state.transactions.push({ id: "example-transaction", amount: -25, date: "2026-11-26", category: "Shopping", description });
      options.onState(state, { source: "cloud", workspace });
      options.onStatus({ phase: "synced", cloud: true, hasSnapshot: true });
      connect.resolve();
    },
  };
}

test("gates account data on both the session and the ledger handshake", async () => {
  const session = deferred();
  const h = harness(session.promise);
  assert.equal(h.shell.hidden, true);
  assert.equal(h.main.innerHTML, "");
  assert.match(h.gate.innerHTML, /Checking your session/);
  session.resolve({ user });

  const options = await h.opened.promise;
  assert.equal(options.accountMode, true);
  assert.equal(options.expectedWorkspace, workspace);
  assert.equal(options.hasLegacy, undefined);
  assert.equal(options.saveDevice, undefined);
  assert.equal(h.shell.hidden, true);
  assert.equal(h.main.innerHTML, "");

  h.mount(options, "Private test transaction");
  assert.equal(h.shell.hidden, false);
  assert.match(h.main.innerHTML, /Private test transaction/);
  assert.equal(h.stats().storageCalls, 0);
});

test("a changed user clears rendered data and ignores later callbacks from the old ledger", async () => {
  const h = harness(Promise.resolve({ user }));
  const options = await h.opened.promise;
  h.mount(options, "Old account transaction");
  assert.match(h.main.innerHTML, /Old account transaction/);
  h.window.dispatchEvent(new CustomEvent("folio-auth-changed", { detail: { user: { ...user, id: "new-account" } } }));

  assert.deepEqual(h.redirects, ["reload"]);
  assert.equal(h.shell.hidden, true);
  for (const selector of ["#main", "#sidebar", "#topbar", "#dialog"]) assert.equal(h.nodes.get(selector).innerHTML, "");
  assert.equal(h.stats().disposed, 1);
  h.mount(options, "Late old account callback");
  assert.equal(h.shell.hidden, true);
  assert.equal(h.main.innerHTML, "");
});

test("signed-out and unavailable sessions stay gated without reading browser data", async () => {
  const signedOut = harness(Promise.resolve({ user: null }));
  const unavailable = harness(Promise.resolve({ unavailable: true, message: "Session check failed" }));
  await setImmediate();

  assert.deepEqual(signedOut.redirects, ["/login"]);
  assert.deepEqual(unavailable.redirects, []);
  assert.match(unavailable.gate.innerHTML, /Session check failed/);
  for (const app of [signedOut, unavailable]) {
    assert.equal(app.shell.hidden, true);
    assert.equal(app.main.innerHTML, "");
    assert.equal(app.stats().storageCalls, 0);
  }
});
