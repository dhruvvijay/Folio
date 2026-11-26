(function application() {
  "use strict";

  const D = window.LedgerData;
  const A = window.LedgerAssistant;
  const C = window.FolioCharts;
  const S = window.LedgerSchema;
  const R = window.LedgerReports;
  const account = window.FolioAccount;
  const main = document.querySelector("#main");
  const sidebar = document.querySelector("#sidebar");
  const topbar = document.querySelector("#topbar");
  const dialog = document.querySelector("#dialog");
  const shell = document.querySelector(".app-shell");
  const scrim = document.querySelector(".scrim");
  const picker = document.querySelector("#csv-picker");
  const backupPicker = document.querySelector("#backup-picker");
  const toast = document.querySelector("#toast");
  const gate = document.createElement("main");
  gate.className = "content";
  gate.tabIndex = -1;

  const icons = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    transactions: '<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/>',
    report: '<path d="M4 4v16h16M8 16v-4m5 4V8m5 8V5"/>',
    cloud: '<path d="M7 18h11a4 4 0 1 0-1-7.9A5.5 5.5 0 0 0 6.4 11 3.5 3.5 0 0 0 7 18Z"/>',
    pie: '<path d="M21 13a9 9 0 1 1-10-10v10z"/><path d="M14 3a8 8 0 0 1 7 7h-7z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    bills: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6m-6 4h6"/>',
    sparkle: '<path d="M11 3c0 4.9-2.1 7-7 7 4.9 0 7 2.1 7 7 0-4.9 2.1-7 7-7-4.9 0-7-2.1-7-7Z"/><path d="M19 13v6m-3-3h6M5 16v4m-2-2h4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="m19 13.5 1.5 1.5-1.6 2.8-2.1-.5a8 8 0 0 1-2 1.2l-.6 2h-3.3l-.7-2a8 8 0 0 1-2-1.2l-2 .5-1.7-2.8L6 13.5a8 8 0 0 1 0-2.4L4.5 9.6 6.2 7l2 .5a8 8 0 0 1 2-1.2l.7-2h3.3l.6 2a8 8 0 0 1 2 1.2l2.1-.5 1.6 2.7-1.5 1.5a8 8 0 0 1 0 2.3Z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
    wallet: '<path d="M20 8V6a2 2 0 0 0-2-2l-13 2a2 2 0 0 0-2 2m0 0h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm18 3h-5a2 2 0 1 0 0 4h5"/>',
    income: '<path d="M6 18 18 6M9 6h9v9"/>',
    expense: '<path d="m6 6 12 12m0-9v9H9"/>',
    trend: '<path d="m3 16 5-5 4 3 7-7m-5 0h5v5"/>',
    down: '<path d="m4 8 5 5 4-3 7 7m-5 0h5v-5"/>',
    pig: '<path d="M19 9h2v6h-2l-1 2v3h-3l-1-2H9l-1 2H5v-3a6 6 0 0 1-2-4H2m15-6 2-2v4M7 8a3 3 0 0 1 6-1"/><path d="M6 9a8 8 0 0 1 12 0M15 11h.01"/>',
    bag: '<path d="M5 8h14l2 13H3zM9 10V6a3 3 0 0 1 6 0v4"/>',
    food: '<path d="M4 4v5a3 3 0 0 0 6 0V4M7 4v17M17 4c-2 2-3 5-3 8h5V4zm2 8v9"/>',
    car: '<path d="m5 11 1.6-5h10.8l1.6 5M4 17v3m16-3v3M3 11h18v6H3zm4 2.5h1m8 0h1"/>',
    house: '<path d="m3 11 9-8 9 8M5 10v10h14V10M10 20v-6h4v6"/>',
    plug: '<path d="M9 3v6m6-6v6M7 9h10v3a5 5 0 0 1-10 0zm5 8v4"/>',
    music: '<path d="M9 18V5l11-2v13M9 18a3 2 0 1 1-6 0 3 2 0 0 1 6 0Zm11-2a3 2 0 1 1-6 0 3 2 0 0 1 6 0Z"/>',
    heart: '<path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-4 4 2 9 8 15 6-6 12-11 8-15Z"/>',
    box: '<rect x="4" y="6" width="16" height="14" rx="2"/><path d="M4 10h16m-10 4h4"/>',
    shield: '<path d="M12 22s7-3 7-9V5l-7-3-7 3v8c0 6 7 9 7 9Z"/><path d="m9 12 2 2 4-4"/>',
    plane: '<path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/>',
    laptop: '<rect x="5" y="4" width="14" height="12" rx="1"/><path d="M5 16 2 20h20l-3-4"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
    edit: '<path d="m13 6 5 5M4 20l4-1L21 6l-4-4L4 15z"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>',
    upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 17v4h16v-4"/>',
    search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 5 5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    dot: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  };

  function icon(name, size = 17) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.box}</svg>`;
  }

  const categories = {
    "Income": ["wallet", "#ebf0df", "#577040", "#829a51"],
    "Food & Dining": ["food", "#eff1e3", "#647747", "#a3ba66"],
    "Shopping": ["bag", "#f4eadf", "#8f6950", "#cfb584"],
    "Transport": ["car", "#e6ede9", "#4f7065", "#98b2a8"],
    "Housing": ["house", "#e9eddd", "#566944", "#63784c"],
    "Utilities": ["plug", "#edf0df", "#6b7041", "#acb286"],
    "Entertainment": ["music", "#eee9f2", "#785b8d", "#a58eb4"],
    "Health": ["heart", "#f4e9e2", "#92674f", "#cf9c83"],
    "Other": ["box", "#eeeae3", "#706b5d", "#ddd9bf"],
  };

  const pages = {
    overview: ["Overview", "grid"],
    transactions: ["Transactions", "transactions"],
    budgets: ["Budgets", "pie"],
    goals: ["Savings goals", "target"],
    bills: ["Bills & subscriptions", "bills"],
    reports: ["Reports", "report"],
    assistant: ["AI assistant", "sparkle"],
    settings: ["Settings", "settings"],
  };

  let state;
  let page = "overview";
  let month = D.today().slice(0, 7);
  let range = 6;
  let filters = { search: "", category: "", type: "", period: "" };
  let modelAvailable = false;
  let useModel = false;
  let chat = [];
  let timer;
  let pendingAction;
  let syncStatus = { phase: "connecting", cloud: false, legacyAvailable: false };
  let activeWorkspace = null;
  let accountUser = null;
  let accountEnding = false;
  let workspaceReady = false;
  let signingOut = false;
  let sync;

  const syncLabels = {
    connecting: "Connecting", saving: "Saving", synced: "Synced", offline: "Offline",
    conflict: "Sync conflict", device: "On this device", migration: "Sync setup",
  };

  function syncLabel(status) {
    if (status.phase === "synced" && !status.hasSnapshot) return "Account ready";
    return syncLabels[status.phase] || "Sync";
  }

  function escape(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  function isDemo() {
    return state.demo ?? state.transactions.some(row => String(row.id).startsWith("sample-"));
  }

  function money(value) {
    return D.money(value, state.currency);
  }

  function signed(value) {
    return `${value > 0 ? "+" : value < 0 ? "−" : ""}${money(Math.abs(value))}`;
  }

  function categoryInfo(category) {
    return Object.hasOwn(categories, category) ? categories[category] : categories.Other;
  }

  function categoryIcon(category) {
    const [name, bg, fg] = categoryInfo(category);
    return `<span class="category-icon" style="background:${bg};color:${fg}">${icon(name, 16)}</span>`;
  }

  function button(label, action, { type = "", glyph = "", value = "" } = {}) {
    return `<button type="button" class="button ${type}" data-action="${action}"${value ? ` data-value="${escape(value)}"` : ""}>${glyph ? icon(glyph, 16) : ""}${escape(label)}</button>`;
  }

  function iconButton(label, glyph, action, value = "", extraClass = "") {
    return `<button type="button" class="icon-button ${extraClass}" aria-label="${escape(label)}" title="${escape(label)}" data-action="${action}"${value ? ` data-value="${escape(value)}"` : ""}${action === "toggle-menu" ? ' aria-controls="sidebar" aria-expanded="false"' : ""}>${icon(glyph, 17)}</button>`;
  }

  function navLink(key) {
    const [name, glyph] = pages[key];
    return `<a class="nav-item" href="#${key}"${page === key ? ' aria-current="page"' : ""}>${icon(glyph, 17)}${escape(name)}</a>`;
  }

  function sidebarProfile() {
    const name = accountUser?.name || (accountUser ? "Your account" : "Personal workspace");
    const label = accountUser?.email || "Private ledger";
    return `<div class="profile folio-account-profile">
      <span class="avatar">${icon("lock", 15)}</span>
      <div class="folio-account-profile-details"><div class="profile-name" title="${escape(name)}">${escape(name)}</div><div class="profile-sub" title="${escape(label)}">${escape(label)}</div></div>
    </div>${accountUser ? '<button type="button" class="text-link folio-account-signout" data-action="account-logout">Sign out</button>' : ""}`;
  }

  function updateNavigation() {
    sidebar.innerHTML = `
      <a class="brand" href="#overview" aria-label="Folio overview">
        <img src="folio.svg" width="35" height="35" alt=""><span class="brand-word">folio<span>.</span></span>
      </a>
      <div class="nav-label">Workspace</div>
      <nav class="nav-group" aria-label="Workspace">
        ${["overview", "transactions", "budgets", "goals", "bills", "reports"].map(navLink).join("")}
      </nav>
      <div class="nav-label">Intelligence</div>
      <nav class="nav-group" aria-label="Intelligence">${navLink("assistant")}</nav>
      <div class="sidebar-bottom">
        ${navLink("settings")}
        ${sidebarProfile()}
      </div>`;
    topbar.innerHTML = `
      <div class="crumb">
        ${iconButton("Open navigation", "menu", "toggle-menu", "", "bare menu-button")}
        <span class="crumb-parent">Workspace</span><span class="crumb-divider" aria-hidden="true">/</span>
        <span class="crumb-current">${escape(pages[page][0])}</span>
      </div>
      <div class="topbar-actions">
        <a href="#settings" id="sync-indicator" class="demo-chip sync-chip"></a>
        ${isDemo() ? `<a href="#settings" class="demo-chip" title="Manage sample data">${icon("box", 13)} Sample data</a>` : ""}
        ${iconButton("View alerts", "bell", "alerts", "", "bare")}
      </div>`;
  }

  function updateSyncWidgets() {
    const indicator = document.querySelector("#sync-indicator");
    if (indicator) {
      const label = syncLabel(syncStatus);
      indicator.classList.toggle("attention", ["migration", "conflict", "offline"].includes(syncStatus.phase));
      indicator.innerHTML = `${icon("cloud", 14)} <span>${escape(label)}</span>`;
      indicator.setAttribute("aria-label", `${label}. Open sync settings.`);
      indicator.title = `${label}. Open sync settings.`;
    }
    const section = document.querySelector("#sync-settings");
    if (section) section.innerHTML = syncSettings();
  }

  function setMenu(open) {
    shell.classList.toggle("nav-open", open);
    scrim.hidden = !open;
    document.querySelector(".menu-button")?.setAttribute("aria-expanded", String(open));
  }

  function monthOptions() {
    const options = new Set([month, D.today().slice(0, 7)]);
    for (let offset = -12; offset <= 2; offset++) options.add(D.shiftMonth(D.today().slice(0, 7), offset));
    state.transactions.forEach(row => options.add(row.date.slice(0, 7)));
    return Array.from(options).sort().reverse();
  }

  function selectOptions(values, active) {
    return values.map(item => {
      const [value, label] = Array.isArray(item) ? item : [item, item];
      return `<option value="${escape(value)}"${value === active ? " selected" : ""}>${escape(label)}</option>`;
    }).join("");
  }

  function monthControl() {
    return `<label class="select-control">${icon("calendar", 15)}
      <select aria-label="Reporting month" data-control="month">${selectOptions(monthOptions().map(entry => [entry, D.monthLabel(entry)]), month)}</select>
      ${icon("chevron", 13)}
    </label>`;
  }

  function pageHead(title, subtitle, actions = "") {
    return `<div class="page-head"><div><h1>${escape(title)}</h1><p>${escape(subtitle)}</p></div>${actions ? `<div class="page-actions">${actions}</div>` : ""}</div>`;
  }

  function periodDelta(current, previous, lowerIsBetter = false) {
    if (previous === 0) return `<span>${current ? "No prior-month comparison" : "No monthly activity"}</span>`;
    const change = (current - previous) / Math.abs(previous) * 100;
    if (Math.abs(change) < .05) return "<span>Steady</span><span>vs last month</span>";
    const up = change > 0;
    return `<span class="delta${up === lowerIsBetter ? " alert" : ""}">${icon(up ? "trend" : "down", 13)} ${up ? "+" : "−"}${Math.abs(change).toFixed(1)}%</span><span>vs last month</span>`;
  }

  function metric(label, glyph, value, foot, featured = false) {
    return `<article class="metric${featured ? " featured" : ""}">
      <div class="metric-top"><h2 class="metric-label">${label}</h2><span class="metric-icon">${icon(glyph, 17)}</span></div>
      <div class="metric-amount">${escape(value)}</div><div class="metric-foot">${foot}</div>
    </article>`;
  }

  function header(title, description = "", actions = "") {
    return `<div class="card-head"><div><h2>${escape(title)}</h2>${description ? `<p>${escape(description)}</p>` : ""}</div>${actions}</div>`;
  }

  function progress(spent, limit) {
    const ratio = limit > 0 ? Math.max(0, spent / limit) : 0;
    return `<div class="progress${ratio > 1 ? " over" : ""}" role="progressbar" aria-label="Progress" aria-valuenow="${Math.min(100, Math.round(ratio * 100))}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.min(100, ratio * 100)}%"></span></div>`;
  }

  function transactionTable(rows, editable, compact = false) {
    if (!rows.length) return `<div class="empty">No transactions match this view.</div>`;
    return `<div class="table-wrap ${editable ? "full-table" : ""}"><table aria-label="${compact ? "Recent transactions" : "Transactions"}">
      <thead><tr><th scope="col">Transaction</th><th scope="col">Category</th><th scope="col">Date</th><th scope="col" style="text-align:right">Amount</th>${editable ? '<th scope="col"><span class="visually-hidden">Edit</span></th>' : ""}</tr></thead>
      <tbody>${rows.map(row => `<tr>
        <td><div class="name-cell">${categoryIcon(row.category)}<span>${escape(row.description)}</span></div></td>
        <td><span class="category-pill">${escape(row.category)}</span></td>
        <td class="date-cell">${escape(compact ? D.dateLabel(row.date).split(",")[0] : D.dateLabel(row.date))}</td>
        <td class="amount-cell${row.amount > 0 ? " income" : ""}">${escape(signed(row.amount))}</td>
        ${editable ? `<td class="action-cell">${iconButton(`Edit ${row.description}`, "edit", "transaction", row.id, "bare")}</td>` : ""}
      </tr>`).join("")}</tbody></table></div>`;
  }

  function overview() {
    const info = D.summary(state, month);
    const savingsRate = info.income > 0 ? info.net / info.income * 100 : null;
    const breakdown = Object.entries(info.categoryTotals)
      .filter(([, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([label, amount]) => ({ label, amount, color: categoryInfo(label)[3] }));
    const rangeControls = `<div class="chart-range" aria-label="Cash flow range">${[3, 6, 12].map(count => `<button type="button" data-action="range" data-value="${count}" aria-pressed="${range === count}" aria-label="${count} months">${count}M</button>`).join("")}</div>`;
    const metrics = [
      metric("Total balance", "wallet", money(info.balance), periodDelta(info.balance, info.previousBalance), true),
      metric("Monthly income", "income", money(info.income), periodDelta(info.income, info.previousIncome)),
      metric("Monthly expenses", "expense", money(info.expenses), periodDelta(info.expenses, info.previousExpenses, true)),
      metric("Savings rate", "pig", savingsRate === null ? "—" : `${savingsRate.toFixed(1)}%`, `<span>${info.net < 0 ? "Net shortfall" : "Net savings"}</span><span class="delta${info.net < 0 ? " alert" : ""}">${escape(money(Math.abs(info.net)))}</span>`),
    ].join("");
    return `${pageHead("Financial overview", "A clear view of your money, all in one place.", monthControl() + button("Add transaction", "transaction", { type: "primary", glyph: "plus" }))}
      <section class="metrics" aria-label="Financial summary">${metrics}</section>
      <div class="dashboard-grid">
        <section class="card card-body chart-card">
          ${header("Cash flow", "Income and expenses over time", rangeControls)}
          <div class="chart-key"><span><i></i>Income</span><span><i></i>Expenses</span></div>
          ${C.cashflow(D.series(state, month, range), { currency: state.currency, range: `Last ${range} months` })}
        </section>
        <section class="card card-body chart-card">
          ${header("Spending breakdown", "Where your money went")}
          ${C.spending(breakdown, { currency: state.currency })}
        </section>
        <section class="card card-body transaction-card">
          ${header("Recent transactions", "", '<a class="text-link" href="#transactions">View transactions</a>')}
          ${transactionTable(info.transactions.slice(0, 5), false, true)}
        </section>
        <div class="dashboard-side">
          <section class="card assistant-card">
            <div class="assistant-kicker">${icon("sparkle", 15)} Folio AI</div>
            <h2>Make sense of<br>your spending.</h2>
            <p>Ask about spending patterns, budgets, or bills coming up.</p>
            <a class="button primary small" href="#assistant">${icon("sparkle", 14)} Ask Folio</a>
          </section>
          <section class="card card-body">
            ${header("Monthly budgets", "", '<a class="text-link" href="#budgets">View budgets</a>')}
            <div class="quick-budget">${state.budgets.slice(0, 3).map(budget => {
              const spent = info.categoryTotals[budget.category] || 0;
              return `<div><div class="progress-label"><span>${escape(budget.category)}</span><span>${escape(money(spent))} / ${escape(money(budget.limit))}</span></div>${progress(spent, budget.limit)}</div>`;
            }).join("") || '<p class="empty">No budgets set.</p>'}</div>
          </section>
        </div>
      </div>`;
  }

  function filteredTransactions() {
    const query = filters.search.trim().toLowerCase();
    return state.transactions.filter(row => {
      const searchable = `${row.description} ${row.category}`.toLowerCase();
      return (!query || searchable.includes(query))
        && (!filters.category || filters.category === row.category)
        && (!filters.type || (filters.type === "income" ? row.amount > 0 : row.amount < 0))
        && (!filters.period || row.date.startsWith(filters.period));
    }).sort((a, b) => b.date.localeCompare(a.date));
  }

  function transactions() {
    const actions = button("Import CSV", "import", { glyph: "upload" }) + button("Export CSV", "export", { glyph: "download" }) + button("Add transaction", "transaction", { type: "primary", glyph: "plus" });
    return `${pageHead("Transactions", "Record and organize your income and spending.", actions)}
      <section class="card"><div class="toolbar">
        <label class="search">${icon("search", 16)}<input class="control" type="search" value="${escape(filters.search)}" data-filter="search" aria-label="Search transactions" placeholder="Search transactions"></label>
        <select class="control" aria-label="Filter by category" data-filter="category">${selectOptions([["", "All categories"], ...D.CATEGORIES], filters.category)}</select>
        <select class="control" aria-label="Filter by type" data-filter="type">${selectOptions([["", "All types"], ["income", "Income"], ["expense", "Expenses"]], filters.type)}</select>
        <select class="control" aria-label="Filter by month" data-filter="period">${selectOptions([["", "All months"], ...monthOptions().map(entry => [entry, D.monthLabel(entry)])], filters.period)}</select>
      </div><div id="transaction-results">${transactionTable(filteredTransactions(), true)}</div></section>`;
  }

  function emptyCard(message, action, label) {
    return `<div class="card empty"><div>${escape(message)}</div>${button(label, action, { glyph: "plus", type: "light small" })}</div>`;
  }

  function budgets() {
    const info = D.summary(state, month);
    return `${pageHead("Budgets", "Set monthly limits and see how much you have left.", monthControl() + button("Set budget", "budget", { type: "primary", glyph: "plus" }))}
      ${state.budgets.length ? `<section class="section-grid" aria-label="Monthly budgets">${state.budgets.map(budget => {
        const spent = info.categoryTotals[budget.category] || 0;
        const available = Math.round((budget.limit - spent) * 100) / 100;
        return `<article class="card feature-card">
          <div class="feature-top"><span>${categoryIcon(budget.category)}<h2>${escape(budget.category)}</h2></span>${iconButton(`Edit ${budget.category} budget`, "edit", "budget", budget.category, "bare")}</div>
          <div class="feature-amount">${escape(money(spent))} <span>of ${escape(money(budget.limit))}</span></div>
          ${progress(spent, budget.limit)}
          <p class="feature-foot${available < 0 ? " alert" : ""}">${escape(money(Math.abs(available)))} ${available < 0 ? "over budget" : "left this month"}</p>
        </article>`;
      }).join("")}</section>` : emptyCard("Set a spending limit for any expense category.", "budget", "Set budget")}`;
  }

  function goals() {
    return `${pageHead("Savings goals", "Track the things you’re setting money aside for.", button("New goal", "goal", { type: "primary", glyph: "plus" }))}
      ${state.goals.length ? `<section class="section-grid" aria-label="Savings goals">${state.goals.map(goal => {
        const remaining = Math.max(0, Math.round((goal.target - goal.saved) * 100) / 100);
        return `<article class="card feature-card">
          <div class="feature-top"><span><span class="category-icon" style="background:#e9eddd;color:#566944">${icon(goal.icon || "target", 16)}</span><h2>${escape(goal.name)}</h2></span>${iconButton(`Edit ${goal.name}`, "edit", "goal", goal.id, "bare")}</div>
          <div class="feature-amount">${escape(money(goal.saved))} <span>of ${escape(money(goal.target))}</span></div>
          ${progress(Math.min(goal.saved, goal.target), goal.target)}
          <p class="feature-foot">${remaining ? `${escape(money(remaining))} to go` : "Goal reached"}</p>
          ${button("Add savings", "contribute", { type: "light small", glyph: "plus", value: goal.id })}
        </article>`;
      }).join("")}</section>` : emptyCard("Create a goal to track your progress.", "goal", "New goal")}`;
  }

  function bills() {
    const rows = [...state.recurring].sort((a, b) => a.nextDate.localeCompare(b.nextDate));
    const total = rows.reduce((sum, bill) => sum + bill.amount, 0);
    return `${pageHead("Bills & subscriptions", rows.length ? `${money(total)} in tracked monthly bills.` : "Keep track of monthly bills and their due dates.", button("Add bill", "bill", { type: "primary", glyph: "plus" }))}
      ${rows.length ? `<section class="card" aria-label="Recurring bills"><div class="table-wrap full-table"><table aria-label="Recurring bills">
        <thead><tr><th scope="col">Bill</th><th scope="col">Category</th><th scope="col">Next due</th><th scope="col" style="text-align:right">Amount</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead>
        <tbody>${rows.map(bill => `<tr><td><div class="name-cell">${categoryIcon(bill.category)}<span>${escape(bill.name)}</span></div></td>
          <td><span class="category-pill">${escape(bill.category)}</span></td><td class="date-cell">${escape(D.dateLabel(bill.nextDate))}</td>
          <td class="amount-cell">${escape(money(bill.amount))}</td>
          <td><div class="row-actions">${button("Mark paid", "pay-bill", { type: "small", glyph: "check", value: bill.id })}${iconButton(`Edit ${bill.name}`, "edit", "bill", bill.id, "bare")}</div></td></tr>`).join("")}</tbody>
      </table></div></section>` : emptyCard("Add a bill to see what’s due next.", "bill", "Add bill")}`;
  }

  function reports() {
    return `${pageHead("Reports", "Compare your spending and cash flow month to month.", monthControl()
      + button("Export this month", "export", { glyph: "download" }))}${R.render(state, month)}`;
  }

  const prompts = [
    "Where did my money go?", "How are my budgets doing?",
    "What’s my month-end spending forecast?", "Any unusual spending this month?",
    "What if I save 100 each month?", "What bills are coming up?",
  ];

  function chatMarkup() {
    const welcome = `<article class="chat-bubble"><h2>Hi, I’m Folio.</h2><p>Ask me about your spending, budgets, goals, or upcoming bills. I use the transactions and plans you’ve added to this workspace.</p></article>`;
    return welcome + chat.map(entry => entry.question
      ? `<div class="chat-bubble user">${escape(entry.question)}</div>`
      : `<article class="chat-bubble"><h2>${escape(entry.title)}</h2><p>${escape(entry.text)}</p>${entry.bullets?.length ? `<ul>${entry.bullets.map(bullet => `<li>${escape(bullet)}</li>`).join("")}</ul>` : ""}${entry.explanation ? `<p class="model-tip"><strong>On-device suggestion</strong> ${escape(entry.explanation)}</p>` : ""}</article>`
    ).join("");
  }

  function assistant() {
    return `${pageHead("Folio AI", "Ask questions about the money you track in Folio.", monthControl())}
      <div class="assistant-page">
        <section class="card chat" aria-label="Finance assistant">
          <div class="chat-history" id="chat-history" role="log" aria-live="polite">${chatMarkup()}</div>
          <form class="chat-form" id="chat-form">
            <input class="control" type="text" name="question" aria-label="Ask about your finances" placeholder="Ask about your finances" maxlength="240" required>
            <button class="button primary" type="submit">${icon("sparkle", 15)} Ask Folio</button>
          </form>
        </section>
        <section class="card card-body">${header("Try a question")}
          <div class="prompt-list">${prompts.map(prompt => button(prompt, "prompt", { value: prompt })).join("")}</div>
          <p class="assistant-model">Amounts come from your ledger and are calculated on this device.</p>
          ${modelAvailable ? `<label class="assistant-model"><input type="checkbox" data-control="model"${useModel ? " checked" : ""}> Add optional suggestions from your browser’s on-device AI.</label>` : ""}
        </section>
      </div>`;
  }

  function field(label, input, note = "") {
    return `<label class="field"><span>${escape(label)}</span>${input}${note ? `<small class="field-note">${escape(note)}</small>` : ""}</label>`;
  }

  function input(name, value = "", attributes = "") {
    return `<input class="control" name="${name}" value="${escape(value)}" ${attributes}>`;
  }

  function select(name, values, selected, attributes = "") {
    return `<select class="control" name="${name}" ${attributes}>${selectOptions(values, selected)}</select>`;
  }

  function syncSettings() {
    const { phase, pending } = syncStatus;
    const legacyAvailable = !accountUser && syncStatus.legacyAvailable;
    const label = syncLabel(syncStatus);
    const controls = [];
    if (phase === "conflict") {
      controls.push(button("Keep this version", "keep-local", { type: "primary" }));
      controls.push(button("Use synced version", "load-cloud"));
    }
    if (legacyAvailable && phase === "migration") {
      controls.push(button("Sync device ledger", "accept-legacy", { type: "primary" }));
      controls.push(button("Continue without copying", "skip-legacy"));
    }
    if (legacyAvailable && phase !== "conflict") controls.push(button("Download device ledger", "backup-legacy", { glyph: "download" }));
    if (phase === "offline" || phase === "device") controls.push(button(pending ? "Retry sync" : "Check connection", "retry-sync"));
    else if (phase === "synced") controls.push(button("Check for updates", "retry-sync"));
    const detail = syncStatus.message || "Folio syncs your ledger to your signed-in account so you can pick it up on another device.";
    return `<div class="sync-setting-head"><h2>Account sync</h2><span class="demo-chip">${escape(label)}</span></div>
      <p>${escape(detail)}</p>
      ${controls.length ? `<div class="settings-row">${controls.join("")}</div>` : ""}`;
  }

  function settings() {
    const currencies = [["USD", "USD · US Dollar"], ["INR", "INR · Indian Rupee"], ["EUR", "EUR · Euro"], ["GBP", "GBP · British Pound"], ["CAD", "CAD · Canadian Dollar"], ["AUD", "AUD · Australian Dollar"], ["SGD", "SGD · Singapore Dollar"], ["AED", "AED · UAE Dirham"], ["JPY", "JPY · Japanese Yen"]];
    return `${pageHead("Settings", "Manage your currency, account sync, and backups.")}
      <div class="settings">
        ${accountUser ? '<div id="folio-account-settings"></div>' : ""}
        <section class="card" id="sync-settings" aria-label="Account sync">${syncSettings()}</section>
        <section class="card"><h2>Ledger preferences</h2><p>Set your balance before the first transaction. Changing the currency updates the currency label on every amount.</p>
          <form id="settings-form">
            ${field("Currency", select("currency", currencies, state.currency))}
            ${field("Opening balance", input("openingBalance", state.openingBalance, 'type="number" step="0.01" min="-999999999" max="999999999" required'))}
            <button type="submit" class="button primary">Save preferences</button>
          </form>
        </section>
        <section class="card"><h2>Transactions</h2><p>CSV files use Date, Description, Category, and Amount columns. Use YYYY-MM-DD dates, negative amounts for expenses, and positive amounts for income.</p><div class="settings-row">
          ${button("Import CSV", "import", { glyph: "upload" })}${button("Export CSV", "export", { glyph: "download" })}
        </div></section>
        <section class="card"><h2>Backup and restore</h2><p>A Folio backup includes your transactions, budgets, savings goals, bills, and preferences. Keep the downloaded file somewhere private.</p><div class="settings-row">
          ${button("Download full backup", "backup", { glyph: "download" })}${button("Restore a backup", "restore-backup", { glyph: "upload" })}
        </div></section>
        <section class="card"><h2>Workspace data</h2><p>Start with a blank ledger or load sample data to explore Folio.</p><div class="settings-row">
          ${button("Start with an empty ledger", "start-fresh", { type: "danger" })}${button("Restore sample data", "restore-demo")}
        </div></section>
      </div>`;
  }

  const views = { overview, transactions, budgets, goals, bills, reports, assistant, settings };

  function render() {
    if (!workspaceReady) return;
    updateNavigation();
    main.innerHTML = views[page]();
    if (page === "settings" && accountUser) account.mountSettings();
    updateSyncWidgets();
  }

  function navigate() {
    if (!workspaceReady) return;
    const key = location.hash.slice(1);
    const next = Object.hasOwn(pages, key) ? key : "overview";
    const changed = next !== page;
    page = next;
    setMenu(false);
    render();
    if (changed) {
      window.scrollTo(0, 0);
      main.focus({ preventScroll: true });
    }
  }

  function notify(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(timer);
    timer = setTimeout(() => toast.classList.remove("visible"), 5100);
  }

  function save(next, message) {
    if (!workspaceReady) return false;
    try {
      next = S.validate(next);
    } catch (error) {
      notify(error.message);
      return false;
    }
    if (!sync.save(next)) {
      notify("Folio couldn’t save these changes. Check your connection or browser storage and try again.");
      return false;
    }
    state = next;
    render();
    notify(message);
    return true;
  }

  function editList(rows, record, match) {
    return rows.some(match) ? rows.map(row => match(row) ? record : row) : [record, ...rows];
  }

  function modal(title, content) {
    dialog.innerHTML = `<div class="dialog-content"><div class="dialog-head"><h2 id="dialog-title">${escape(title)}</h2>${iconButton("Close dialog", "x", "close", "", "bare")}</div>${content}</div>`;
    dialog.setAttribute("aria-labelledby", "dialog-title");
    if (!dialog.open) dialog.showModal();
  }

  function modalActions(label, deleteAction = "", key = "") {
    return `<p class="form-error" id="form-error" role="alert" hidden></p>
      <div class="form-actions">${deleteAction ? button("Delete", deleteAction, { type: "danger", value: key }) : ""}${button("Cancel", "close")}<button class="button primary" type="submit">${escape(label)}</button></div>`;
  }

  function formModal(title, form, body, label, deleteAction = "", key = "") {
    modal(title, `<form data-form="${form}" data-key="${escape(key)}">${body}${modalActions(label, deleteAction, key)}</form>`);
  }

  const expenseCategories = D.CATEGORIES.filter(category => category !== "Income");
  const positiveAmount = 'type="number" step="0.01" min="0.01" max="999999999" required';
  const nonnegativeAmount = 'type="number" step="0.01" min="0" max="999999999" required';
  const dateAttributes = 'type="date" min="1900-01-01" max="9999-12-31" required';
  const nameAttributes = 'type="text" maxlength="100" required';

  function openTransaction(key) {
    const existing = state.transactions.find(row => row.id === key);
    const type = existing?.amount > 0 ? "income" : "expense";
    formModal(existing ? "Edit transaction" : "Add transaction", "transaction", `
      ${field("Description", input("description", existing?.description, `${nameAttributes} placeholder="e.g. Grocery store" autofocus`))}
      <div class="field-grid">
        ${field("Type", select("type", [["expense", "Expense"], ["income", "Income"]], type))}
        ${field(`Amount (${state.currency})`, input("amount", existing ? Math.abs(existing.amount) : "", positiveAmount))}
      </div>
      <div class="field-grid">
        ${field("Date", input("date", existing?.date || D.today(), dateAttributes))}
        ${field("Category", select("category", type === "income" ? ["Income"] : expenseCategories, existing?.category || "Other"), "Suggested from the description.")}
      </div>`, existing ? "Save changes" : "Add transaction", existing ? "delete-transaction" : "", key);
  }

  function openBudget(key) {
    const existing = state.budgets.find(row => row.category === key);
    const available = expenseCategories.filter(category => category === key || !state.budgets.some(row => row.category === category));
    if (!available.length) {
      modal("Set budget", "<p>Every expense category already has a budget. Open an existing budget to edit its monthly limit.</p>");
      return;
    }
    formModal(existing ? "Edit budget" : "Set budget", "budget",
      field("Category", select("category", available, key || available[0]))
      + field(`Monthly limit (${state.currency})`, input("limit", existing?.limit, positiveAmount)),
      existing ? "Save changes" : "Set budget", existing ? "delete-budget" : "", key);
  }

  function openGoal(key) {
    const existing = state.goals.find(row => row.id === key);
    formModal(existing ? "Edit savings goal" : "New savings goal", "goal", `
      ${field("Goal name", input("name", existing?.name, `${nameAttributes} placeholder="e.g. Emergency fund" autofocus`))}
      <div class="field-grid">
        ${field(`Target (${state.currency})`, input("target", existing?.target, positiveAmount))}
        ${field(`Already saved (${state.currency})`, input("saved", existing?.saved ?? 0, nonnegativeAmount))}
      </div>`, existing ? "Save changes" : "Create goal", existing ? "delete-goal" : "", key);
  }

  function openBill(key) {
    const existing = state.recurring.find(row => row.id === key);
    formModal(existing ? "Edit monthly bill" : "Add monthly bill", "bill", `
      ${field("Bill name", input("name", existing?.name, `${nameAttributes} placeholder="e.g. Internet plan" autofocus`))}
      <div class="field-grid">
        ${field(`Monthly amount (${state.currency})`, input("amount", existing?.amount, positiveAmount))}
        ${field("Next due date", input("nextDate", existing?.nextDate || D.today(), dateAttributes))}
      </div>
      ${field("Category", select("category", expenseCategories, existing?.category || "Other"))}`, existing ? "Save changes" : "Add bill", existing ? "delete-bill" : "", key);
  }

  function confirmAction(title, detail, label, action, danger = false) {
    pendingAction = action;
    modal(title, `<p>${escape(detail)}</p><hr class="divider"><div class="form-actions">${button("Cancel", "close")}${button(label, "confirm", { type: danger ? "danger" : "primary" })}</div>`);
  }

  function deleteItem(collection, fieldName, key, title, detail) {
    confirmAction(title, detail, "Delete", () => save({
      ...state, [collection]: state[collection].filter(row => row[fieldName] !== key),
    }, "Item deleted."), true);
  }

  function payBill(key) {
    const bill = state.recurring.find(row => row.id === key);
    if (!bill) return;
    confirmAction("Record bill payment", `Record ${money(bill.amount)} for ${bill.name} today and move its due date forward by one month?`, "Record payment", () => {
      const nextMonth = D.shiftMonth(bill.nextDate.slice(0, 7), 1);
      const lastDay = new Date(`${D.shiftMonth(nextMonth, 1)}-01T00:00:00Z`);
      lastDay.setUTCDate(0);
      const dueDay = bill.dueDay || Number(bill.nextDate.slice(8));
      const nextDate = `${nextMonth}-${String(Math.min(dueDay, lastDay.getUTCDate())).padStart(2, "0")}`;
      const row = { id: D.id(), date: D.today(), amount: -bill.amount, description: bill.name, category: bill.category };
      return save({
        ...state,
        transactions: [row, ...state.transactions],
        recurring: editList(state.recurring, { ...bill, nextDate, dueDay }, item => item.id === key),
      }, "Payment recorded and due date updated.");
    });
  }

  function alerts() {
    const info = D.summary(state, month);
    const within = new Date(`${D.today()}T00:00:00Z`);
    within.setUTCDate(within.getUTCDate() + 7);
    const entries = state.budgets.filter(row => (info.categoryTotals[row.category] || 0) > row.limit)
      .map(row => `${row.category} is ${money(info.categoryTotals[row.category] - row.limit)} over budget for ${D.monthLabel(month)}.`);
    state.recurring.filter(row => row.nextDate <= within.toISOString().slice(0, 10))
      .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
      .forEach(row => entries.push(`${row.name} · ${money(row.amount)} · due ${D.dateLabel(row.nextDate)}.`));
    modal("Alerts", entries.length ? `<ul class="alert-list">${entries.map(message => `<li>${escape(message)}</li>`).join("")}</ul>` : "<p>No budgets are over limit for the selected month, and no bills are due in the next seven days.</p>");
  }

  function ask(question) {
    const query = question.trim().slice(0, 240);
    if (!query) return;
    const context = {
      ...state, month, balance: D.summary(state, month).balance,
    };
    const answer = A.answer(query, context);
    chat.push({ question: query }, answer);
    if (chat.length > 32) chat.splice(0, 2);
    const history = document.querySelector("#chat-history");
    if (history) history.innerHTML = chatMarkup();
    if (useModel) {
      void A.explain(query, context).then(explanation => {
        if (explanation && chat.includes(answer)) {
          answer.explanation = explanation;
          const currentHistory = document.querySelector("#chat-history");
          if (currentHistory) currentHistory.innerHTML = chatMarkup();
        }
      });
    }
  }

  function download(content, mime, filename) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement("a"), { href: url, download: filename });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadCSV() {
    let rows = state.transactions;
    if (page === "transactions") rows = filteredTransactions();
    if (page === "reports") rows = D.summary(state, month).transactions;
    download(D.exportCSV(rows), "text/csv;charset=utf-8", page === "reports" ? `folio-${month}.csv` : "folio-transactions.csv");
    notify("Transaction CSV downloaded.");
  }

  function downloadBackup(ledger = state, prefix = "folio") {
    if (!ledger) return;
    try {
      download(S.encodeBackup(ledger), "application/json;charset=utf-8", `${prefix}-backup-${D.today()}.json`);
      notify("Full workspace backup downloaded.");
    } catch (error) {
      notify(error.message);
    }
  }

  function finishSyncChange(action) {
    const changed = action();
    if (!changed) notify("Sync couldn’t apply this choice. Check the sync status and try again.");
    return changed;
  }

  async function restoreBackup(file) {
    if (!file || !workspaceReady) return;
    try {
      if (file.size > S.MAX_BYTES) throw new Error("Choose a Folio backup smaller than 1 MB.");
      const text = await file.text();
      if (!workspaceReady) return;
      const next = S.decodeBackup(text);
      confirmAction("Restore this backup?",
        `This replaces the current ledger with ${next.transactions.length} transactions, ${next.budgets.length} budgets, ${next.goals.length} savings goals, and ${next.recurring.length} bills from the backup.`,
        "Restore ledger", () => {
          const saved = save(next, "Ledger restored from backup.");
          if (saved) clearSession();
          return saved;
        }, true);
    } catch (error) {
      if (workspaceReady) modal("Restore backup", `<p>${escape(error.message)}</p>`);
    }
  }

  async function prepareLogout() {
    if (!syncStatus.pending || await sync.flush()) return true;
    if (!workspaceReady) return false;
    return new Promise(resolve => {
      dialog.addEventListener("close", () => resolve(false), { once: true });
      confirmAction("Sign out with unsynced changes?",
        "Some changes are still in this tab. You can cancel and download a full backup from Settings.",
        "Sign out", () => { resolve(true); return true; }, true);
    });
  }

  async function signOut() {
    if (signingOut || !accountUser) return;
    signingOut = true;
    try {
      if (!account.registerLogoutGuard && !await prepareLogout()) return;
      await account.logout();
    } catch (error) {
      if (workspaceReady) notify(error.message || "Folio couldn’t sign you out. Try again.");
    } finally {
      signingOut = false;
    }
  }

  function emptyLedger(currency = "USD") {
    return { transactions: [], budgets: [], goals: [], recurring: [], openingBalance: 0, currency, demo: false };
  }

  const actions = {
    "toggle-menu": () => setMenu(!shell.classList.contains("nav-open")),
    "account-logout": () => { void signOut(); },
    close: () => dialog.close(),
    confirm: () => { if (pendingAction?.()) dialog.close(); },
    alerts,
    range: value => { range = Number(value); main.innerHTML = overview(); main.querySelector(`[data-action="range"][data-value="${range}"]`)?.focus(); },
    transaction: openTransaction,
    budget: openBudget,
    goal: openGoal,
    bill: openBill,
    contribute(key) {
      const goal = state.goals.find(item => item.id === key);
      if (!goal) return;
      formModal(`Add savings to ${goal.name}`, "contribute",
        field(`Amount (${state.currency})`, input("amount", "", positiveAmount), "This updates your goal progress. Record any related transaction separately."),
        "Add savings", "", key);
    },
    "pay-bill": payBill,
    "delete-transaction": key => deleteItem("transactions", "id", key, "Delete transaction?", "This changes the balances and reports that include this transaction."),
    "delete-budget": key => deleteItem("budgets", "category", key, "Delete budget?", "This removes the monthly limit for this category."),
    "delete-goal": key => deleteItem("goals", "id", key, "Delete savings goal?", "This removes the goal and its tracked progress."),
    "delete-bill": key => deleteItem("recurring", "id", key, "Delete bill?", "This removes the bill from your recurring schedule."),
    import: () => picker.click(),
    export: downloadCSV,
    backup: () => downloadBackup(),
    "backup-legacy": () => downloadBackup(sync.getLegacy(), "folio-device"),
    "restore-backup": () => backupPicker.click(),
    "retry-sync": () => { void sync.retry(); },
    "accept-legacy": () => confirmAction("Sync this device ledger?",
      "Folio will copy this device’s ledger into your signed-in account so it’s available on your other devices.",
      "Sync ledger", () => finishSyncChange(sync.acceptLegacy)),
    "skip-legacy": () => confirmAction("Continue without copying?",
      "The account workspace will open with sample data. Your previous browser ledger stays available to download from Settings.",
      "Continue", () => finishSyncChange(sync.loadCloud)),
    "keep-local": () => confirmAction("Replace the synced ledger?",
      "Folio will upload the version shown on this device and replace the conflicting synced version.",
      "Keep this version", () => finishSyncChange(sync.keepLocal), true),
    "load-cloud": () => confirmAction("Use the synced version?",
      "This replaces the draft shown on this device with the synced ledger. Download a backup first if you want to keep the draft.",
      "Use synced version", () => finishSyncChange(sync.loadCloud), true),
    prompt: ask,
    "start-fresh": () => confirmAction("Start with an empty ledger?", "This replaces the current workspace with an empty ledger. Download a full backup first if you need a copy.", "Start fresh", () => {
      const oldMonth = month;
      month = D.today().slice(0, 7);
      const saved = save(emptyLedger(state.currency), "Your new ledger is ready.");
      if (saved) clearSession();
      else month = oldMonth;
      return saved;
    }, true),
    "restore-demo": () => confirmAction("Restore sample data?", "This replaces your ledger, budgets, goals, and bills with the sample workspace.", "Restore samples", () => {
      const oldMonth = month;
      month = D.DEFAULT_MONTH;
      const saved = save({ ...D.seed(), demo: true }, "Sample data restored.");
      if (saved) clearSession();
      else month = oldMonth;
      return saved;
    }, true),
  };

  function clearSession() {
    chat = [];
    filters = { search: "", category: "", type: "", period: "" };
  }

  function suggestCategory(form, force = false) {
    const type = form.elements.type.value;
    const category = form.elements.category;
    if (type === "income") {
      category.innerHTML = selectOptions(["Income"], "Income");
      return;
    }
    if (!force && category.dataset.userSelected === "true") return;
    const suggestion = A.categorize(form.elements.description.value);
    category.innerHTML = selectOptions(expenseCategories, expenseCategories.includes(suggestion) ? suggestion : "Other");
  }

  function submitModal(form) {
    const data = new FormData(form);
    const next = { ...state };
    const key = form.dataset.key;
    const amount = Number(data.get("amount"));
    const name = String(data.get("name") || data.get("description") || "").trim();
    const category = data.get("category");
    const match = item => item.id === key;
    let message = "Changes saved.";
    if (["transaction", "goal", "bill"].includes(form.dataset.form) && !name) {
      const error = form.querySelector("#form-error");
      error.textContent = "Enter a name or description.";
      error.hidden = false;
      return;
    }
    switch (form.dataset.form) {
      case "transaction":
        next.transactions = editList(state.transactions, {
          id: key || D.id(), date: data.get("date"), description: name, category, amount: data.get("type") === "income" ? amount : -amount,
        }, match);
        message = key ? "Transaction updated." : "Transaction added.";
        break;
      case "budget":
        next.budgets = editList(state.budgets, { category, limit: Number(data.get("limit")) }, item => item.category === key);
        message = "Budget saved.";
        break;
      case "goal":
        next.goals = editList(state.goals, {
          id: key || D.id(), name, target: Number(data.get("target")), saved: Number(data.get("saved")),
          icon: state.goals.find(match)?.icon || "target",
        }, match);
        message = "Savings goal saved.";
        break;
      case "contribute":
        next.goals = state.goals.map(item => match(item) ? { ...item, saved: Math.round((item.saved + amount) * 100) / 100 } : item);
        message = "Savings added.";
        break;
      case "bill": {
        const nextDate = data.get("nextDate");
        const existing = state.recurring.find(match);
        const dueDay = existing?.nextDate === nextDate && existing.dueDay ? existing.dueDay : Number(nextDate.slice(8));
        next.recurring = editList(state.recurring, { id: key || D.id(), name, amount, nextDate, category, dueDay }, match);
        message = "Monthly bill saved.";
        break;
      }
      default:
        return;
    }
    if (save(next, message)) dialog.close();
  }

  function transactionKey(row) {
    return JSON.stringify([row.date, row.description.trim().toLowerCase(), row.category, row.amount]);
  }

  async function importCSV(file) {
    if (!file || !workspaceReady) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Choose a CSV file smaller than 5 MB.");
      const text = await file.text();
      if (!workspaceReady) return;
      const imported = D.parseCSV(text);
      const existing = new Map();
      for (const row of state.transactions) {
        const key = transactionKey(row);
        existing.set(key, (existing.get(key) || 0) + 1);
      }
      const rows = imported.filter(row => {
        const key = transactionKey(row);
        const count = existing.get(key) || 0;
        if (!count) return true;
        existing.set(key, count - 1);
        return false;
      });
      if (!rows.length) {
        notify(imported.length ? "These transactions are already in your ledger." : "No transactions were found in this CSV.");
        return;
      }
      const count = rows.length === 1 ? "1 transaction" : `${rows.length} transactions`;
      if (save({ ...state, transactions: [...rows, ...state.transactions] }, `Imported ${count}.`)) {
        filters = { search: "", category: "", type: "", period: "" };
        location.hash = "transactions";
        if (page === "transactions") main.innerHTML = transactions();
      }
    } catch (error) {
      if (workspaceReady) modal("CSV import", `<p>${escape(error.message)}</p>`);
    }
  }

  window.addEventListener("hashchange", navigate);
  dialog.addEventListener("close", () => { pendingAction = undefined; });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && shell.classList.contains("nav-open")) {
      setMenu(false);
      document.querySelector(".menu-button")?.focus();
    }
  });
  scrim.addEventListener("click", () => setMenu(false));
  picker.addEventListener("change", () => {
    const file = picker.files?.[0];
    picker.value = "";
    void importCSV(file);
  });
  backupPicker.addEventListener("change", () => {
    const file = backupPicker.files?.[0];
    backupPicker.value = "";
    void restoreBackup(file);
  });

  document.addEventListener("click", event => {
    if (!workspaceReady) return;
    const target = event.target.closest("[data-action]");
    if (target) actions[target.dataset.action]?.(target.dataset.value || "");
    if (event.target.closest(".sidebar a")) setMenu(false);
  });

  document.addEventListener("input", event => {
    if (!workspaceReady) return;
    const field = event.target;
    if (field.dataset.filter === "search") {
      filters.search = field.value;
      document.querySelector("#transaction-results").innerHTML = transactionTable(filteredTransactions(), true);
    }
    if (field.name === "description" && field.form?.dataset.form === "transaction") suggestCategory(field.form);
  });

  document.addEventListener("change", event => {
    if (!workspaceReady) return;
    const field = event.target;
    if (field.dataset.control === "month") {
      month = field.value;
      main.innerHTML = views[page]();
      main.querySelector('[data-control="month"]')?.focus();
    }
    if (field.dataset.control === "model") useModel = field.checked;
    if (field.dataset.filter && field.dataset.filter !== "search") {
      filters[field.dataset.filter] = field.value;
      document.querySelector("#transaction-results").innerHTML = transactionTable(filteredTransactions(), true);
    }
    if (field.form?.dataset.form === "transaction") {
      if (field.name === "type") suggestCategory(field.form, true);
      if (field.name === "category") field.dataset.userSelected = "true";
    }
  });

  document.addEventListener("submit", event => {
    if (!workspaceReady) return;
    const form = event.target;
    if (form.dataset.form) {
      event.preventDefault();
      submitModal(form);
    }
    if (form.id === "settings-form") {
      event.preventDefault();
      const data = new FormData(form);
      save({ ...state, currency: data.get("currency"), openingBalance: Number(data.get("openingBalance")) }, "Preferences saved.");
    }
    if (form.id === "chat-form") {
      event.preventDefault();
      ask(form.elements.question.value);
      form.reset();
    }
  });

  function showWorkspaceGate(title, detail, retry = false) {
    shell.hidden = true;
    document.querySelector(".skip-link").hidden = true;
    if (!gate.isConnected) shell.before(gate);
    gate.innerHTML = `<div class="page-head"><div><h1>${escape(title)}</h1><p role="status">${escape(detail)}</p></div>
      ${retry ? '<button type="button" class="button primary">Try again</button>' : ""}</div>`;
    gate.querySelector("button")?.addEventListener("click", () => location.reload());
  }

  function clearAccountWorkspace() {
    if (accountEnding) return;
    accountEnding = true;
    workspaceReady = false;
    accountUser = null;
    state = null;
    activeWorkspace = null;
    pendingAction = undefined;
    clearSession();
    if (dialog.open) dialog.close();
    dialog.replaceChildren();
    clearTimeout(timer);
    toast.textContent = "";
    toast.classList.remove("visible");
    picker.value = "";
    backupPicker.value = "";
    main.replaceChildren();
    sidebar.replaceChildren();
    topbar.replaceChildren();
    setMenu(false);
    showWorkspaceGate("Checking your session", "Opening your Folio workspace.");
    sync?.dispose();
    sync = undefined;
  }

  function mountWorkspace() {
    if (workspaceReady || accountEnding) return;
    workspaceReady = true;
    gate.remove();
    shell.hidden = false;
    document.querySelector(".skip-link").hidden = false;
    navigate();
    void A.canExplain().then(available => {
      if (!workspaceReady) return;
      modelAvailable = available;
      if (available && page === "assistant") main.innerHTML = assistant();
    }).catch(() => {});
  }

  function createWorkspaceSync(options) {
    return window.LedgerSync.create({
      initialState: state,
      ...options,
      onState(next, { source, workspace }) {
        if (accountEnding || source === "account-cleared") return;
        if (workspace === activeWorkspace && JSON.stringify(next) === JSON.stringify(state)) return;
        if (workspace !== activeWorkspace) clearSession();
        activeWorkspace = workspace;
        const wasDemo = isDemo();
        state = next;
        if (!workspaceReady) month = isDemo() ? D.DEFAULT_MONTH : D.today().slice(0, 7);
        else if (month === D.DEFAULT_MONTH && wasDemo && !isDemo()) month = D.today().slice(0, 7);
        render();
      },
      onStatus(status) {
        if (accountEnding) return;
        syncStatus = status;
        if (accountUser && status.cloud) mountWorkspace();
        if (workspaceReady) updateSyncWidgets();
      },
      onUnauthorized() {
        if (!accountUser || accountEnding) return;
        clearAccountWorkspace();
        void Promise.resolve(account.invalidate()).then(() => {
          if (account.user) location.replace("/login");
        }, () => location.replace("/login"));
      },
    });
  }

  window.addEventListener("folio-auth-changed", event => {
    if (!accountUser || accountEnding) return;
    const user = event.detail?.user;
    if (user?.id === accountUser.id) {
      accountUser = user;
      if (workspaceReady) {
        updateNavigation();
        updateSyncWidgets();
      }
      return;
    }
    clearAccountWorkspace();
    location.reload();
  });

  async function connectWorkspace() {
    showWorkspaceGate("Checking your session", "Opening your Folio workspace.");
    try {
      const session = await account.ready;
      if (session === null) {
        state = D.read();
        month = isDemo() ? D.DEFAULT_MONTH : month;
        sync = createWorkspaceSync({ hasLegacy: D.hasSavedState(), saveDevice: D.save });
        mountWorkspace();
        await sync.start();
        return;
      }
      if (session?.unavailable) {
        showWorkspaceGate("Couldn’t check your session", session.message || "Check your connection and try again.", true);
        return;
      }
      if (session?.user === null) {
        location.replace("/login");
        return;
      }
      if (typeof session?.user?.id !== "string" || !session.user.id) throw new Error("Account identity is missing.");
      accountUser = session.user;
      account.registerCleanup(clearAccountWorkspace);
      account.registerLogoutGuard?.(prepareLogout);
      state = emptyLedger();
      const identity = new TextEncoder().encode(`folio:ledger-owner:v1\0${accountUser.id}`);
      const digest = await window.crypto.subtle.digest("SHA-256", identity);
      if (accountEnding) return;
      const expectedWorkspace = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      sync = createWorkspaceSync({ accountMode: true, expectedWorkspace, freshState: emptyLedger });
      showWorkspaceGate("Opening your ledger", "Connecting to your Folio account.");
      await sync.start();
      if (!workspaceReady && !accountEnding) {
        showWorkspaceGate("Couldn’t open your ledger", syncStatus.message || "Check your connection and try again.", true);
      }
    } catch {
      if (!workspaceReady && !accountEnding) showWorkspaceGate("Couldn’t open Folio", "Check your connection and try again.", true);
    }
  }

  void connectWorkspace();
})();
