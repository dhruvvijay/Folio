(() => {
  "use strict";

  const sessionFailure = "Folio couldn’t check your session. Check your connection and try again.";
  const signalKey = "folio-auth-signal-v1";
  const recoveryPattern = /^[A-Za-z0-9_-]{32}$/;
  const cleanups = new Set();
  const guards = new Set();
  const root = document.querySelector("#folio-login");
  let user = null;
  let mode = "checking";
  let sessionVersion = 0;
  let ending = false;
  let showingSignupCode = false;
  let restoreEntry = false;
  let codeDialog = null;
  let channel;

  try {
    if ("BroadcastChannel" in window) channel = new BroadcastChannel(signalKey);
  } catch {
    // The storage event below is a fallback for blocked broadcast channels.
  }

  function text(value) {
    const node = document.createElement("span");
    node.textContent = value;
    return node.innerHTML;
  }

  function verifiedUser(value) {
    return value && typeof value.id === "string" && value.id &&
      typeof value.email === "string" && typeof value.name === "string"
      ? Object.freeze({ id: value.id, email: value.email, name: value.name, createdAt: value.createdAt })
      : null;
  }

  async function request(path, { method = "GET", body } = {}) {
    if (!/^\/api\/auth\/[a-z-]+$/.test(path)) throw new Error("Invalid account request.");
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    let response;
    let payload;
    try {
      response = await fetch(path, {
        method, headers, credentials: "same-origin", cache: "no-store", redirect: "error",
        signal: controller.signal,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      payload = await response.json().catch(error => {
        if (controller.signal.aborted) throw error;
        return null;
      });
    } catch {
      throw new Error("Folio couldn’t connect. Check your connection and try again.");
    } finally {
      window.clearTimeout(timeout);
    }

    if (!response.ok) {
      const message = typeof payload?.error === "string" && payload.error.length <= 240
        ? payload.error : "Folio couldn’t complete the request. Try again.";
      throw Object.assign(new Error(message), { status: response.status });
    }
    if (!payload || typeof payload !== "object") {
      throw new Error("Folio returned an unexpected response. Try again.");
    }
    return payload;
  }

  async function readSession() {
    try {
      const result = await request("/api/auth/session");
      if (result.user === null) return { user: null, mode: "anonymous" };
      const account = verifiedUser(result.user);
      if (account) return { user: account, mode: "account" };
    } catch (error) {
      if (error.status === 404) return null;
      if (error.status === 401) return { user: null, mode: "anonymous" };
    }
    return { user: null, mode: "unavailable", unavailable: true, message: sessionFailure };
  }

  const ready = readSession().then(result => {
    user = result?.user ?? null;
    mode = result?.mode ?? "legacy";
    return result;
  });

  function signalOtherTabs() {
    if (channel) {
      channel.postMessage("changed");
    } else {
      try {
        localStorage.setItem(signalKey, new Date().toISOString() + Math.random());
        localStorage.removeItem(signalKey);
      } catch {
        // Cross-tab delivery may be unavailable in restricted browsing contexts.
      }
    }
  }

  function register(set, callback) {
    if (typeof callback !== "function") throw new TypeError("Expected a callback.");
    set.add(callback);
    return () => set.delete(callback);
  }

  function hideApplication(hidden) {
    document.documentElement.classList.toggle("folio-auth-check", hidden);
  }

  async function install(next, kind) {
    const previous = user;
    user = next;
    mode = next ? "account" : "anonymous";
    if (previous && previous.id !== next?.id) {
      hideApplication(true);
      clearCodeDialog();
      await Promise.allSettled([...cleanups].map(callback => {
        try {
          return callback(previous.id);
        } catch (error) {
          return Promise.reject(error);
        }
      }));
    }
    window.dispatchEvent(new CustomEvent("folio-auth-changed", { detail: { user, kind } }));
  }

  function go(path) {
    window.location.replace(path);
  }

  async function refreshFromBrowser() {
    const version = ++sessionVersion;
    const hadAccount = Boolean(user);
    if (hadAccount && !root) hideApplication(true);
    await ready;
    if (mode === "legacy" || ending || showingSignupCode) return;
    const result = await readSession();
    if (version !== sessionVersion || ending || showingSignupCode) return;
    if (result?.unavailable || !result) {
      if (user && !root) {
        await install(null, "authorization-lost");
        window.location.reload();
      } else if (root) {
        renderUnavailable(result?.message ?? sessionFailure);
      }
      return;
    }

    if (user?.id !== result.user?.id) {
      await install(result.user, "session-changed");
      if (result.user) go("/");
      else if (!root) go("/login");
      else renderEntry("login");
      return;
    }
    if (result.user && (result.user.name !== user.name || result.user.email !== user.email)) {
      await install(result.user, "profile");
    }
    hideApplication(false);
  }

  function onSignal() {
    void refreshFromBrowser();
  }

  if (channel) channel.addEventListener("message", event => { if (event.data === "changed") onSignal(); });
  else window.addEventListener("storage", event => { if (event.key === signalKey && event.newValue) onSignal(); });
  window.addEventListener("pagehide", event => {
    if (!event.persisted) return;
    if (user && !root) hideApplication(true);
    clearCodeDialog();
    for (const form of document.querySelectorAll("form[data-account-form]")) {
      if (form.querySelector("[data-visibility]")) resetPasswords(form);
    }
    if (root && showingSignupCode) {
      showingSignupCode = false;
      restoreEntry = true;
      root.replaceChildren();
    }
  });
  window.addEventListener("pageshow", event => {
    if (!event.persisted || mode === "legacy") return;
    if (restoreEntry) window.location.reload();
    else onSignal();
  });

  async function endSession(path, kind, body = {}, guard = false) {
    if (ending) return false;
    ending = true;
    try {
      if (guard) for (const check of guards) if (await check() === false) return false;
      if (!user) return false;
      try {
        await request(path, { method: kind === "account-deleted" ? "DELETE" : "POST", body });
      } catch (error) {
        if (kind === "account-deleted" || error.status !== 401) throw error;
      }
      if (root) showingSignupCode = false;
      ++sessionVersion;
      await install(null, kind);
      signalOtherTabs();
      go("/login");
      return true;
    } finally {
      ending = false;
    }
  }

  function logout() {
    return endSession("/api/auth/logout", "logout", {}, true);
  }

  async function invalidate() {
    if (!user) return;
    ++sessionVersion;
    await install(null, "authorization-lost");
    signalOtherTabs();
    go("/login");
  }

  function field(prefix, name, label, { type = "text", autocomplete = "off", maximum, help } = {}) {
    const id = prefix + "-" + name;
    const description = (help ? id + "-help " : "") + id + "-error";
    const limits = maximum ? ' maxlength="' + maximum + '"' : "";
    const input = '<input id="' + id + '" name="' + name + '" type="' + type +
      '" autocomplete="' + autocomplete + '" aria-describedby="' + description + '"' + limits +
      (type === "email" ? ' inputmode="email" spellcheck="false" autocapitalize="none"' : "") +
      (type === "password" || name === "recoveryCode" ? ' spellcheck="false" autocapitalize="none" autocorrect="off"' : "") + ' required>';
    const control = type === "password" ? '<div class="account-password">' + input +
      '<button type="button" class="account-password-toggle" data-visibility="' + id +
      '" aria-controls="' + id + '" aria-label="Show ' + label.toLowerCase() + '" aria-pressed="false" data-label="' +
      label.toLowerCase() + '">Show</button></div>' : input;
    return '<div class="account-field"><label for="' + id + '">' + label + '</label>' + control +
      (help ? '<p class="account-help" id="' + id + '-help">' + help + '</p>' : "") +
      '<p class="account-field-error" id="' + id + '-error" hidden></p></div>';
  }

  function password(prefix, name, label, current = false, help) {
    return field(prefix, name, label, { type: "password", autocomplete: current ? "current-password" : "new-password", maximum: 128, help });
  }

  function formMarkup(type, fields, title, variant = "primary") {
    return '<form class="account-form" data-account-form="' + type + '" novalidate>' + fields +
      '<div class="account-message" data-account-message role="status" hidden></div>' +
      '<button class="button ' + variant + '" type="submit">' + title + '</button></form>';
  }

  function feedback(form, message, error = false) {
    const status = form.querySelector("[data-account-message]");
    status.dataset.error = String(error);
    status.hidden = !message;
    status.textContent = message;
  }

  function fieldError(input, message = "") {
    input.toggleAttribute("aria-invalid", Boolean(message));
    if (message) input.setAttribute("aria-invalid", "true");
    const error = document.getElementById(input.id + "-error");
    if (error) {
      error.hidden = !message;
      error.textContent = message;
    }
  }

  function values(form) {
    const fields = [...form.querySelectorAll("input[name]")];
    const read = Object.fromEntries(fields.map(input => [input.name, input.type === "checkbox" ? input.checked : input.value]));
    if (typeof read.email === "string") read.email = read.email.trim();
    if (typeof read.name === "string") read.name = read.name.trim();
    if (typeof read.recoveryCode === "string") read.recoveryCode = read.recoveryCode.trim();
    let invalid;
    for (const input of fields) {
      const value = read[input.name];
      let error = "";
      const label = input.labels?.[0]?.textContent.trim().toLowerCase();
      if (!value) error = input.type === "checkbox" ? "Confirm this action to continue." : "Enter " + (label || "a value for this field") + ".";
      else if (input.type === "email" && (input.validity.typeMismatch || value.length > 254)) error = "Enter a valid email address.";
      else if (input.name === "name" && value.length > 80) error = "Use up to 80 characters for your name.";
      else if (input.name === "recoveryCode" && !recoveryPattern.test(value)) error = "Enter the 32-character recovery code exactly as saved.";
      else if (input.autocomplete === "new-password" && input.name !== "confirmPassword" && (value.length < 12 || value.length > 128)) {
        error = "Use 12 to 128 characters.";
      } else if (input.name === "confirmPassword" && value !== (read.newPassword ?? read.password)) error = "The passwords don’t match.";
      fieldError(input, error);
      if (error && !invalid) invalid = input;
    }
    if (invalid) {
      invalid.focus();
      return null;
    }
    return read;
  }

  function busy(form, active, label = "") {
    const submit = form.querySelector('[type="submit"]');
    if (active) submit.dataset.label = submit.textContent;
    form.setAttribute("aria-busy", String(active));
    for (const control of form.elements) control.disabled = active;
    submit.textContent = active ? label : submit.dataset.label;
  }

  const passwordHelp = "Use 12 to 128 characters.";

  function entryFields(view) {
    const prefix = "folio-" + view;
    const email = field(prefix, "email", "Email address", { type: "email", autocomplete: view === "login" ? "username" : "email", maximum: 254 });
    const confirmation = password(prefix, "confirmPassword", "Confirm password");
    if (view === "signup") {
      return field(prefix, "name", "Name", { autocomplete: "name", maximum: 80 }) + email +
        password(prefix, "password", "Password", false, passwordHelp) + confirmation;
    }
    if (view === "recovery") {
      return email + field(prefix, "recoveryCode", "Recovery code", { maximum: 32 }) +
        password(prefix, "newPassword", "New password", false, passwordHelp) + confirmation;
    }
    return email + password(prefix, "password", "Password", true);
  }

  const entryViews = {
    login: {
      heading: "Welcome back.",
      description: "Sign in to open your Folio workspace.",
      button: "Sign in",
      links: [["signup", "Create an account"], ["recovery", "Forgot password?"]],
    },
    signup: {
      heading: "Create your account.",
      description: "Set up your own workspace for spending, bills, and savings goals.",
      button: "Create account",
      links: [["login", "Back to sign in"]],
    },
    recovery: {
      heading: "Reset your password.",
      description: "Use the private recovery code you saved when setting up your account or last updating your password.",
      button: "Reset password",
      links: [["login", "Back to sign in"]],
    },
  };

  function renderEntry(view, focus = false, message = "") {
    const screen = entryViews[view];
    const links = screen.links.map(([destination, label]) => {
      const href = destination === "login" ? "/login" : "/login?view=" + destination;
      return '<a class="account-link" href="' + href + '">' + label + '</a>';
    }).join("");
    document.title = screen.button + " | Folio";
    root.setAttribute("aria-busy", "false");
    root.innerHTML = '<h1 class="account-heading" tabindex="-1">' + screen.heading + '</h1>' +
      '<p class="account-intro-text">' + screen.description + '</p>' +
      formMarkup(view, entryFields(view), screen.button) + '<nav class="account-links" aria-label="Account actions">' + links + '</nav>';
    if (message) feedback(root.querySelector("form"), message);
    if (focus) root.querySelector("h1").focus();
  }

  function renderUnavailable(message) {
    root.setAttribute("aria-busy", "false");
    root.innerHTML = '<h1 class="account-heading" tabindex="-1">Sign-in is unavailable.</h1>' +
      '<p class="account-intro-text">' + text(message) + '</p>' +
      '<button class="button primary" type="button" data-account-retry>Retry</button>';
  }

  function requiredCode(payload) {
    if (typeof payload.recoveryCode === "string" && recoveryPattern.test(payload.recoveryCode)) return payload.recoveryCode;
    throw new Error("Folio did not return a recovery code. You can create a fresh code under Settings.");
  }

  function codeContent(id, buttonLabel) {
    return '<h1 class="account-heading" id="' + id + '-title" tabindex="-1">Save your recovery code.</h1>' +
      '<p class="account-intro-text">Keep this code somewhere private. It lets you reset your password and Folio only shows it once.</p>' +
      '<form class="account-form account-recovery" data-recovery-panel>' +
      '<code class="account-recovery-code" aria-label="Recovery code"></code>' +
      '<div class="account-recovery-actions"><button class="button" type="button" data-account-copy>Copy code</button>' +
      '<button class="button" type="button" data-account-download>Download code</button></div>' +
      '<p class="account-message" data-account-message role="status" hidden></p>' +
      '<label class="account-ack"><input type="checkbox" name="saved"> <span>I’ve saved this recovery code.</span></label>' +
      '<button class="button primary" type="submit" disabled>' + buttonLabel + '</button></form>';
  }

  async function copyCode(form, code) {
    try {
      await navigator.clipboard.writeText(code);
      feedback(form, "Recovery code copied.");
    } catch {
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(form.querySelector("code"));
        selection.removeAllRanges();
        selection.addRange(range);
      }
      feedback(form, selection ? "Press Ctrl+C or Command+C to copy the selected code." : "Use Download code to save a copy.");
    }
  }

  function downloadCode(form, code) {
    const file = new Blob(["Folio account recovery code\n\n" + code + "\n\nKeep this code private.\n"], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "folio-recovery-code.txt";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 3_000);
    feedback(form, "Recovery code download started.");
  }

  function bindCode(panel, code, done) {
    const form = panel.querySelector("[data-recovery-panel]");
    const submit = form.querySelector('[type="submit"]');
    form.querySelector("code").textContent = code;
    form.querySelector("[data-account-copy]").addEventListener("click", () => void copyCode(form, code));
    form.querySelector("[data-account-download]").addEventListener("click", () => downloadCode(form, code));
    const saved = form.elements.namedItem("saved");
    saved.addEventListener("change", () => { submit.disabled = !saved.checked; });
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (saved.checked) {
        submit.disabled = true;
        form.querySelector("code").textContent = "";
        done();
      }
    });
    panel.querySelector("h1").focus();
  }

  function entryCode(code, kind) {
    showingSignupCode = true;
    document.title = "Save your Folio recovery code";
    root.innerHTML = codeContent("folio-entry-code", kind === "signup" ? "Continue to Folio" : "Return to sign in");
    bindCode(root, code, () => {
      showingSignupCode = false;
      signalOtherTabs();
      if (kind === "signup") {
        go("/");
      } else {
        window.history.replaceState(null, "", "/login");
        renderEntry("login", true, "Your password was reset. Sign in with your new password.");
      }
    });
  }

  function clearCodeDialog() {
    if (!codeDialog) return;
    codeDialog.close();
    codeDialog.remove();
    codeDialog = null;
  }

  function settingsCode(code) {
    clearCodeDialog();
    codeDialog = document.createElement("dialog");
    codeDialog.className = "account-dialog";
    codeDialog.setAttribute("aria-labelledby", "folio-settings-code-title");
    codeDialog.innerHTML = codeContent("folio-settings-code", "Done");
    codeDialog.addEventListener("cancel", event => event.preventDefault());
    document.body.append(codeDialog);
    codeDialog.showModal();
    bindCode(codeDialog, code, clearCodeDialog);
  }

  function setVisibility(toggle, reveal) {
    const input = document.getElementById(toggle.dataset.visibility);
    input.type = reveal ? "text" : "password";
    toggle.setAttribute("aria-pressed", String(reveal));
    toggle.setAttribute("aria-label", (reveal ? "Hide " : "Show ") + toggle.dataset.label);
    toggle.textContent = reveal ? "Hide" : "Show";
  }

  function resetPasswords(form) {
    form.reset();
    for (const toggle of form.querySelectorAll("[data-visibility]")) setVisibility(toggle, false);
  }

  function checkbox(name, label, id) {
    return '<div class="account-field"><label class="account-ack" for="' + id + '"><input type="checkbox" id="' + id +
      '" name="' + name + '" aria-describedby="' + id + '-error"><span>' + label + '</span></label><p class="account-field-error" id="' + id + '-error" hidden></p></div>';
  }

  function section(title, description, form, danger = false) {
    return '<details class="account-security-panel' + (danger ? " danger" : "") + '"><summary>' + title + '</summary>' +
      '<p>' + description + '</p>' + form + '</details>';
  }

  function mountSettings() {
    const settings = document.getElementById("folio-account-settings");
    if (!settings || !user) return;
    const profile = formMarkup("profile", field("folio-profile", "name", "Display name", { autocomplete: "name", maximum: 80 }), "Save name", "");
    const passwordForm = formMarkup("password",
      password("folio-credentials", "currentPassword", "Current password", true) +
      password("folio-credentials", "newPassword", "New password", false, passwordHelp) +
      password("folio-credentials", "confirmPassword", "Confirm password"), "Update password", "");
    const codeForm = formMarkup("recovery-code", password("folio-code", "currentPassword", "Current password", true),
      "Create new recovery code", "");
    const signOut = formMarkup("logout-all", "", "Sign out everywhere", "");
    const deletion = formMarkup("account",
      password("folio-delete", "password", "Current password", true) + checkbox("confirmed",
        "I understand this will permanently delete my account and synced ledger.", "folio-delete-confirmed"),
      "Permanently delete account", "danger");

    settings.classList.add("account-settings");
    settings.innerHTML = '<section class="card account-section"><h2>Profile</h2><p>Signed in as ' + text(user.email) + '.</p>' + profile +
      '</section><section class="card account-section"><h2>Account security</h2>' +
      section("Change password", "Changing your password signs out other browsers and replaces your recovery code.", passwordForm) +
      section("Replace recovery code", "The old code stops working when you create a new one.", codeForm) +
      section("Sign out on all devices", "This signs you out here and in all other browsers.", signOut) +
      section("Delete account", "Delete your account and the ledger stored with it. You can download a backup first.", deletion, true) + '</section>';
    settings.querySelector("#folio-profile-name").value = user.name;
  }

  const apiForms = {
    login: {
      pending: "Signing in…", keys: ["email", "password"],
      async success(result) {
        const next = verifiedUser(result.user);
        if (!next) throw new Error(sessionFailure);
        ++sessionVersion;
        await install(next, "login");
        signalOtherTabs();
        go("/");
      },
    },
    signup: {
      pending: "Creating your account…", keys: ["name", "email", "password"],
      async success(result) {
        const next = verifiedUser(result.user);
        if (!next) throw new Error(sessionFailure);
        const code = requiredCode(result);
        ++sessionVersion;
        await install(next, "login");
        entryCode(code, "signup");
      },
    },
    recovery: {
      pending: "Resetting password…", keys: ["email", "recoveryCode", "newPassword"],
      success(result) { entryCode(requiredCode(result), "recovery"); },
    },
    profile: {
      pending: "Saving name…", keys: ["name"], method: "PATCH",
      async success(result, form) {
        const next = verifiedUser(result.user);
        if (!next || next.id !== user?.id) {
          await invalidate();
          return;
        }
        ++sessionVersion;
        await install(next, "profile");
        feedback(form, "Name saved.");
        signalOtherTabs();
      },
    },
    password: {
      pending: "Updating password…", keys: ["currentPassword", "newPassword"],
      success(result, form) {
        resetPasswords(form);
        signalOtherTabs();
        settingsCode(requiredCode(result));
      },
    },
    "recovery-code": {
      pending: "Replacing recovery code…", keys: ["currentPassword"],
      success(result, form) {
        resetPasswords(form);
        settingsCode(requiredCode(result));
      },
    },
    "logout-all": { pending: "Signing out…", keys: [] },
    account: { pending: "Deleting account…", keys: ["password"] },
  };

  async function submit(form) {
    const action = form.dataset.accountForm;
    const details = apiForms[action];
    if (!details || form.getAttribute("aria-busy") === "true") return;
    feedback(form, "");
    const input = values(form);
    if (!input) return;
    busy(form, true, details.pending);
    const payload = Object.fromEntries(details.keys.map(key => [key, input[key]]));
    try {
      if (action === "logout-all") {
        await endSession("/api/auth/logout-all", "logout-all", payload, true);
      } else if (action === "account") {
        await endSession("/api/auth/account", "account-deleted", payload);
      } else {
        const result = await request("/api/auth/" + action, { method: details.method || "POST", body: payload });
        if (!ending) await details.success(result, form);
      }
    } catch (error) {
      feedback(form, error.message || "Folio couldn’t complete the request. Try again.", true);
    } finally {
      if (form.isConnected) busy(form, false);
    }
  }

  document.addEventListener("submit", event => {
    if (!event.target.matches("form[data-account-form]")) return;
    event.preventDefault();
    void submit(event.target);
  });

  document.addEventListener("input", event => {
    if (event.target.matches(".account-form [aria-invalid=true]")) fieldError(event.target);
  });

  document.addEventListener("click", event => {
    const toggle = event.target.closest("[data-visibility]");
    if (toggle) setVisibility(toggle, toggle.getAttribute("aria-pressed") === "false");
    if (event.target.closest("[data-account-retry]")) window.location.reload();
  });

  window.FolioAccount = Object.freeze({
    ready,
    get user() { return user; },
    request,
    logout,
    invalidate,
    registerCleanup: callback => register(cleanups, callback),
    registerLogoutGuard: callback => register(guards, callback),
    mountSettings,
  });

  if (root) void ready.then(result => {
    if (result?.user) {
      go("/");
    } else if (result?.unavailable || !result) {
      renderUnavailable(result?.message ?? "Accounts aren’t available at this Folio address.");
    } else {
      const view = new URLSearchParams(window.location.search).get("view");
      renderEntry(view === "signup" || view === "recovery" ? view : "login");
    }
  });
})();
