(function syncModule() {
  "use strict";

  const draftPrefix = "folio-account-drafts-v1:";
  const workspacePattern = /^[a-zA-Z0-9_-]{1,128}$/;
  const endpoint = "/api/ledger";

  function validate(state) {
    return window.LedgerSchema?.validate(state) ?? state;
  }

  function sameState(left, right) {
    return left === right || JSON.stringify(left) === JSON.stringify(right);
  }

  function snapshot(data) {
    if (typeof data?.workspace !== "string" || !workspacePattern.test(data.workspace) ||
        !Number.isSafeInteger(data.revision) || data.revision < 0 ||
        ((data.revision === 0) !== (data.state === null)) ||
        (data.revision > 0 && (!data.state || typeof data.state !== "object" || Array.isArray(data.state)))) {
      throw new Error("Folio received an invalid sync response.");
    }
    return { workspace: data.workspace, revision: data.revision, state: data.state === null ? null : validate(data.state) };
  }

  async function request(method, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await window.fetch(endpoint, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        headers: method === "PUT" ? { "Content-Type": "application/json" } : { Accept: "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.redirected || (response.ok && response.headers?.get("content-type")?.includes("text/html"))) {
        return { status: 401 };
      }
      if (response.status === 404 || response.status === 405 ||
          response.status === 401 || response.status === 403) {
        return { status: response.status };
      }
      if (response.ok || response.status === 409) {
        return { status: response.status, snapshot: snapshot(await response.json()) };
      }
      let message;
      try {
        const data = await response.json();
        if (typeof data.error === "string") message = data.error.slice(0, 240);
      } catch {
        // A gateway may return HTML during maintenance.
      }
      return { status: response.status, message };
    } finally {
      clearTimeout(timeout);
    }
  }

  function removeDraft(record) {
    try {
      if (record && window.localStorage.getItem(record.key) === record.raw) {
        window.localStorage.removeItem(record.key);
      }
    } catch {
      // Acknowledged cloud data remains safe if local storage is inaccessible.
    }
  }

  function findDrafts(workspace, remoteState) {
    const prefix = `${draftPrefix}${workspace}:`;
    let records = [];
    try {
      const storage = window.localStorage;
      const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
      for (const key of keys) {
        if (!key?.startsWith(prefix)) continue;
        const raw = storage.getItem(key);
        try {
          const parsed = JSON.parse(raw);
          if (!Number.isSafeInteger(parsed?.base) || parsed.base < 0 || !Number.isFinite(parsed.time)) continue;
          const state = validate(parsed.state);
          const record = { key, raw, base: parsed.base, time: parsed.time, state };
          if (sameState(state, remoteState)) removeDraft(record);
          else records.push(record);
        } catch {
          // Keep unrecognized data untouched and continue with readable drafts.
        }
      }
    } catch {
      records = [];
    }
    return records.sort((left, right) => right.time - left.time);
  }

  function create({ initialState, hasLegacy = false, onState, onStatus, saveDevice, freshState }) {
    const tabId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const makeFresh = typeof freshState === "function" ? freshState : () => window.LedgerData?.seed() ?? initialState;
    let legacy = hasLegacy ? initialState : null;
    let workspace = null;
    let revision = 0;
    let cloudState = null;
    let draft = null;
    let ownRecord = null;
    let recoveredRecord = null;
    let conflictReason = "";
    let migration = false;
    let phase = "connecting";
    let operation = null;
    let startPromise = null;
    let lastCheck = 0;

    function status(nextPhase, message = "") {
      phase = nextPhase;
      onStatus?.({
        phase,
        cloud: workspace !== null,
        hasSnapshot: cloudState !== null,
        legacyAvailable: legacy !== null,
        pending: draft !== null,
        draftStored: Boolean(draft && (ownRecord?.state === draft.state || recoveredRecord?.state === draft.state)),
        message,
      });
    }

    function show(state, source) {
      onState?.(state, { source, workspace });
    }

    function storeDraft() {
      try {
        const key = `${draftPrefix}${workspace}:${tabId}`;
        const raw = JSON.stringify({ base: draft.base, time: Date.now(), state: draft.state });
        window.localStorage.setItem(key, raw);
        ownRecord = { key, raw, state: draft.state };
      } catch {
        // The in-memory copy can still be transmitted or exported.
      }
    }

    function clearDraft() {
      removeDraft(ownRecord);
      removeDraft(recoveredRecord);
      draft = null;
      ownRecord = null;
      recoveredRecord = null;
      conflictReason = "";
    }

    function leaveAccount() {
      if (workspace === null) return;
      workspace = null;
      revision = 0;
      cloudState = null;
      draft = null;
      ownRecord = null;
      recoveredRecord = null;
      conflictReason = "";
      migration = false;
      show(legacy === null ? makeFresh() : legacy, legacy === null ? "sample" : "device");
    }

    function applySnapshot(remote, recover) {
      const accountChanged = workspace !== remote.workspace;
      if (accountChanged) {
        leaveAccount();
        workspace = remote.workspace;
      }
      revision = remote.revision;
      cloudState = remote.state;
      if (!draft && (accountChanged || recover)) {
        const records = findDrafts(workspace, cloudState);
        if (records.length) {
          recoveredRecord = records[0];
          draft = { state: recoveredRecord.state, base: recoveredRecord.base };
          migration = false;
          show(draft.state, "draft");
          if (records.length > 1) {
            conflictReason = "More than one offline copy is saved in this browser. The most recent copy is open.";
          }
        }
      }
      if (draft && sameState(draft.state, cloudState)) {
        clearDraft();
        show(cloudState, "cloud");
      }
      if (draft) {
        if (draft.base !== revision) conflictReason ||= "Your account ledger changed while this copy was being edited.";
        if (conflictReason) status("conflict", conflictReason);
        return;
      }
      if (cloudState !== null) {
        migration = false;
        show(cloudState, "cloud");
        status("synced");
      } else if (accountChanged && legacy !== null) {
        migration = true;
        show(legacy, "device");
        status("migration", "A ledger is saved in this browser. Choose whether to copy it to your account.");
      } else if (migration) {
        status("migration", "A ledger is saved in this browser. Choose whether to copy it to your account.");
      } else {
        if (accountChanged) show(makeFresh(), "sample");
        status("synced");
      }
    }

    function networkFailure() {
      status("offline", !draft || ownRecord?.state === draft.state || recoveredRecord?.state === draft.state
        ? "Folio could not connect. Retry sync when you’re back online."
        : "Folio could not connect or store this draft. Keep this tab open or export a backup.");
    }

    async function pushDraft() {
      while (workspace !== null && draft && !conflictReason && !migration) {
        const sent = draft;
        status("saving");
        let result;
        try {
          result = await request("PUT", { workspace, expectedRevision: sent.base, state: sent.state });
        } catch {
          networkFailure();
          return;
        }
        if (result.status === 401 || result.status === 403) {
          leaveAccount();
          status("device", "Cloud access changed. Retry sync to check your sign-in.");
          return;
        }
        const remote = result.snapshot;
        if (!remote) {
          if (result.status === 413 || result.status === 422) {
            status("offline", result.message || "This copy could not be saved to your account. Export a backup or review the ledger.");
          } else {
            networkFailure();
          }
          return;
        }
        if (remote.workspace !== workspace) {
          applySnapshot(remote, true);
          return;
        }
        revision = remote.revision;
        cloudState = remote.state;
        if (result.status === 409 && !sameState(sent.state, cloudState) && !sameState(draft.state, cloudState)) {
          conflictReason = "Your account ledger changed before this copy could be saved.";
          status("conflict", conflictReason);
          return;
        }
        if (draft === sent || sameState(draft.state, cloudState)) {
          clearDraft();
          status("synced");
          return;
        }
        draft = { ...draft, base: revision };
        storeDraft();
      }
    }

    function run(operationToRun) {
      if (operation) return operation;
      operation = Promise.resolve().then(operationToRun).finally(() => { operation = null; });
      return operation;
    }

    function refresh({ recover = false } = {}) {
      return run(async () => {
        lastCheck = Date.now();
        if (workspace === null) status("connecting");
        let result;
        try {
          result = await request("GET");
        } catch {
          networkFailure();
          return;
        }
        if (result.status === 401 || result.status === 403) {
          leaveAccount();
          status("device", "Sign in to sync this ledger across devices.");
          return;
        }
        if (result.status === 404 || result.status === 405) {
          if (workspace !== null) networkFailure();
          else status("device", "Cloud sync is unavailable. Changes stay in this browser.");
          return;
        }
        if (!result.snapshot) {
          networkFailure();
          return;
        }
        applySnapshot(result.snapshot, recover);
        if (draft && !conflictReason) await pushDraft();
      });
    }

    function start() {
      if (!startPromise) {
        window.addEventListener("online", () => { if (phase === "offline") void refresh(); });
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible" && Date.now() - lastCheck > 30000 && phase === "synced") void refresh();
        });
        startPromise = refresh({ recover: true });
      }
      return startPromise;
    }

    function queue(next) {
      draft = { state: next, base: draft?.base ?? revision };
      storeDraft();
      if (conflictReason) status("conflict", conflictReason);
      else {
        status("saving");
        void run(pushDraft);
      }
    }

    function save(next) {
      try {
        next = validate(next);
      } catch (error) {
        status(phase, error.message);
        return false;
      }
      if (workspace !== null && !migration) {
        queue(next);
        return true;
      }
      try {
        if (!saveDevice?.(next)) return false;
      } catch {
        return false;
      }
      legacy = next;
      status(phase, migration ? "This copy is saved in the browser and can be copied to your account." : "");
      return true;
    }

    function acceptLegacy() {
      if (workspace === null || legacy === null || draft || operation) return false;
      let next;
      try {
        next = validate(legacy);
      } catch (error) {
        status(phase, error.message);
        return false;
      }
      migration = false;
      show(next, "device");
      queue(next);
      return true;
    }

    function keepLocal() {
      if (workspace === null || !draft || !conflictReason || operation) return false;
      conflictReason = "";
      draft = { ...draft, base: revision };
      storeDraft();
      status("saving");
      void run(pushDraft);
      return true;
    }

    function loadCloud() {
      if (workspace === null || operation || (!conflictReason && !migration)) return false;
      clearDraft();
      migration = false;
      show(cloudState === null ? makeFresh() : cloudState, cloudState === null ? "sample" : "cloud");
      status("synced");
      return true;
    }

    return {
      start, save, refresh, keepLocal, loadCloud,
      retry: () => refresh({ recover: true }),
      acceptLegacy,
      getLegacy: () => legacy,
    };
  }

  window.LedgerSync = Object.freeze({ create });
})();
