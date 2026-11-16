// Admin console: overview, users, one user, trades, games and the audit log. Each admin page has
// <body data-page="...">; this file renders that page into <main id="content">. Every request is checked
// on the server too: a non-admin gets 403 from every /api/admin route, whatever this page shows.

const content = document.getElementById("content");
const PAGE = document.body.dataset.page;

const ACTIONS = {
  "account.reset": "Reset account",
  "account.cash_adjust": "Adjusted cash",
  "user.disable": "Disabled user",
  "user.enable": "Enabled user",
  "user.role.promote": "Made admin",
  "user.role.demote": "Removed admin",
  "session.sign_out_all": "Signed out everywhere",
  "profile.rename": "Changed display name",
  "authz.denied": "Access denied"
};

function scenarioName(id) {
  const s = typeof SCENARIOS !== "undefined" && SCENARIOS.find((x) => x.id === id);
  return s ? s.name : id;
}

function userLink(userId, label) {
  return el("a", { href: "admin-user.html?id=" + encodeURIComponent(userId) }, label || "Unknown user");
}

function head(title, text, ...actions) {
  return el("div", { class: "page-head" }, el("div", null, el("h1", null, title), text ? el("p", null, text) : null), actions.length ? el("div", { class: "button-row" }, actions) : null);
}

function refreshButton(render) {
  return el("button", { type: "button", class: "btn", onclick: render }, "Refresh");
}

function loading() {
  content.replaceChildren(el("div", { class: "kpis" }, Array.from({ length: 4 }, () => el("div", { class: "kpi" }, el("span", { class: "skeleton" }), el("span", { class: "skeleton tall", style: "margin-top: 10px" })))),
    el("div", { class: "panel" }, el("span", { class: "skeleton chart-skel" })));
}

function failed(e, retry) {
  content.replaceChildren(errorState("This page could not be loaded. " + e.message, retry));
}

function csvDownload(filename, header, rows) {
  const cell = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const text = [header, ...rows].map((r) => r.map(cell).join(",")).join("\n");
  const a = el("a", { href: URL.createObjectURL(new Blob([text], { type: "text/csv" })), download: filename });
  document.body.append(a);
  a.click();
  a.remove();
}

// A sortable, paged table.
//   columns: [{ label, value: row => sortable value, render: row => node or text, num, hideSm }]
function dataTable({ columns, rows, onRow, pageSize = 25, empty = "Nothing to show.", sortIndex = null, sortDir = "desc" }) {
  let page = 0;
  let sortCol = sortIndex;
  let dir = sortDir;
  const body = el("tbody");
  const pager = el("div", { class: "pager" });
  const headRow = el("tr");
  const wrap = el("div", null, el("div", { class: "table-wrap" }, el("table", { class: "stack-sm " + (onRow ? "clickable" : "") }, el("thead", null, headRow), body)), pager);

  function draw() {
    headRow.replaceChildren(...columns.map((c, i) => el("th", { class: (c.num ? "num " : "") + (c.hideSm ? "hide-sm" : ""), "aria-sort": sortCol === i ? (dir === "asc" ? "ascending" : "descending") : null },
      c.value ? el("button", { type: "button", class: "sort", "data-dir": sortCol === i ? dir : null, onclick: () => { dir = sortCol === i && dir === "desc" ? "asc" : "desc"; sortCol = i; page = 0; draw(); } }, c.label) : c.label)));
    let list = rows.slice();
    if (sortCol !== null) {
      const v = columns[sortCol].value;
      list.sort((a, b) => {
        const x = v(a);
        const y = v(b);
        const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""));
        return dir === "asc" ? cmp : -cmp;
      });
    }
    const pages = Math.max(1, Math.ceil(list.length / pageSize));
    page = Math.min(page, pages - 1);
    const shown = list.slice(page * pageSize, (page + 1) * pageSize);
    body.replaceChildren(...(shown.length ? shown.map((r) => el("tr", { onclick: onRow ? (e) => { if (!e.target.closest("a, button, summary")) onRow(r); } : null },
      columns.map((c) => el("td", { class: (c.num ? "num " : "") + (c.hideSm ? "hide-sm" : ""), "data-label": c.label }, c.render(r)))))
      : [el("tr", null, el("td", { colspan: columns.length }, el("div", { class: "empty" }, empty)))]));
    pager.hidden = list.length <= pageSize;
    pager.replaceChildren(el("span", null, (page * pageSize + 1) + "–" + Math.min(list.length, (page + 1) * pageSize) + " of " + list.length),
      el("div", { class: "button-row" },
        el("button", { type: "button", class: "btn sm", disabled: page === 0, onclick: () => { page--; draw(); } }, "Previous"),
        el("button", { type: "button", class: "btn sm", disabled: page >= pages - 1, onclick: () => { page++; draw(); } }, "Next")));
  }
  draw();
  return wrap;
}

function kpi(label, value, note) {
  return el("div", { class: "kpi" }, el("dt", null, label), el("dd", null, value), note ? el("small", null, note) : null);
}

function bars(items, kind, format = (n) => String(n)) {
  if (!items.length) return el("p", { class: "muted" }, "No data yet.");
  const max = Math.max(...items.map((i) => i.count));
  return el("ul", { class: "bars " + (kind || "") }, items.map((i) => el("li", null,
    el("span", null, i.label), el("span", { class: "mono muted" }, format(i.count)),
    el("span", { class: "track" }, el("span", { class: "fill", style: "width:" + (i.count / max) * 100 + "%" })))));
}

function tradeStatus(t) {
  return el("div", null, statusPill(t.status), t.rejectionReason ? el("div", { class: "note" }, t.rejectionReason) : null);
}

// ======================= OVERVIEW =======================

async function renderOverview() {
  setCrumbs([["Overview"]]);
  loading();
  let d;
  try {
    d = await api("/admin/overview");
  } catch (e) {
    return failed(e, renderOverview);
  }
  const k = d.kpis;
  const days = d.tradesByDay;
  const maxDay = Math.max(1, ...days.map((x) => x.accepted + x.rejected));
  const label = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

  content.replaceChildren(
    head("Overview", "Activity across every MarketStreet account.", refreshButton(renderOverview)),
    el("dl", { class: "kpis" },
      kpi("Users", k.users.toLocaleString("en-US"), "+" + k.newUsers7d + " in the last 7 days"),
      kpi("Active users", k.activeUsers7d.toLocaleString("en-US"), "Signed in or traded in 7 days"),
      kpi("Orders today", k.tradesToday.toLocaleString("en-US"), plural(k.trades7d, "order") + " in 7 days"),
      kpi("Accept rate", k.acceptRate === null ? "—" : (k.acceptRate * 100).toFixed(1) + "%", "Accepted ÷ all orders"),
      kpi("Simulated value", money(k.totalValueCents), "Average return " + (k.avgReturnPct === null ? "—" : percent(k.avgReturnPct))),
      kpi("Challenges finished", k.gamesFinished + " of " + k.gamesStarted, "Average stars " + (k.avgStars === null ? "—" : k.avgStars.toFixed(1)))),
    el("div", { class: "grid-halves" },
      el("div", null, el("section", { class: "panel" },
        el("div", { class: "panel-head" }, el("h2", null, "Orders per day"), el("div", { class: "legend" }, el("span", null, el("i", { style: "background: var(--accent)" }), "Accepted"), el("span", null, el("i", { style: "background: var(--sell)" }), "Rejected"))),
        el("div", { class: "columns", role: "img", "aria-label": "Orders per day over the last 14 days" }, days.map((x) => el("div", { class: "col", title: label(x.date) + ": " + x.accepted + " accepted, " + x.rejected + " rejected" },
          el("span", { class: "acc", style: "height:" + (x.accepted / maxDay) * 100 + "%" }), el("span", { class: "rej", style: "height:" + (x.rejected / maxDay) * 100 + "%" })))),
        el("div", { class: "columns-axis" }, el("span", null, label(days[0].date)), el("span", null, "Today"))),
        el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h2", null, "Top rejection reasons"), el("span", { class: "muted" }, "All time")), bars(d.rejectionReasons, "bad"))),
      el("div", null, el("section", { class: "panel" }, el("div", { class: "panel-head" }, el("h2", null, "Most traded stocks"), el("span", { class: "muted" }, "Accepted orders")), bars(d.topSymbols)),
      el("section", { class: "panel flush" }, el("div", { class: "panel-head" }, el("h2", null, "Top accounts"), el("a", { class: "btn sm", href: "admin-users.html" }, "All users")),
        dataTable({ rows: d.topUsers, onRow: (u) => (location.href = "admin-user.html?id=" + encodeURIComponent(u.userId)), empty: "No accounts yet.", columns: [
          { label: "User", render: (u) => userLink(u.userId, u.name || u.email) },
          { label: "Value", num: true, render: (u) => money(u.valueCents) },
          { label: "Return", num: true, render: (u) => percent(u.returnPct) }] })))),
    el("section", { class: "panel flush", style: "margin-top: 20px" },
      el("div", { class: "panel-head" }, el("h2", null, "Latest orders"), el("a", { class: "btn sm", href: "admin-trades.html" }, "All trades")),
      tradesTable(d.recentTrades.slice(0, 5), 5)));
  markUpdated();
}

function tradesTable(trades, pageSize = 25) {
  return dataTable({ rows: trades, pageSize, sortIndex: 0, empty: "No orders yet.", onRow: (t) => (location.href = "admin-user.html?id=" + encodeURIComponent(t.userId)), columns: [
    { label: "Submitted", value: (t) => t.submittedAt, render: (t) => el("span", { title: formatTime(t.submittedAt, true) }, formatTime(t.submittedAt)) },
    { label: "User", value: (t) => t.ownerEmail, render: (t) => userLink(t.userId, t.ownerName || t.ownerEmail) },
    { label: "Order", value: (t) => t.stockSymbol, render: (t) => orderText(t) },
    { label: "Status", value: (t) => t.status, render: tradeStatus },
    { label: "Price", num: true, value: (t) => t.executionPrice || 0, render: (t) => (t.executionPrice ? money(cents(t.executionPrice)) : "—") },
    { label: "Total", num: true, value: (t) => t.transactionValue || 0, render: (t) => (t.transactionValue ? money(cents(t.transactionValue)) : "—") },
    { label: "Reference", hideSm: true, render: (t) => el("span", { class: "mono muted", title: t.transactionId }, shortId(t.transactionId)) }] });
}

// ======================= USERS =======================

async function renderUsers() {
  setCrumbs([["Users"]]);
  loading();
  let users;
  try {
    users = (await api("/admin/users")).users;
  } catch (e) {
    return failed(e, renderUsers);
  }
  const search = el("input", { type: "search", placeholder: "Search name or email", "aria-label": "Search users" });
  const role = el("select", { "aria-label": "Role" }, el("option", { value: "" }, "All roles"), el("option", { value: "admin" }, "Admins"), el("option", { value: "member" }, "Members"));
  const status = el("select", { "aria-label": "Status" }, el("option", { value: "" }, "Any status"), el("option", { value: "Active" }, "Active"), el("option", { value: "Disabled" }, "Disabled"));
  const count = el("span", { class: "muted", style: "margin-left: auto" });
  const holder = el("div");

  function draw() {
    const q = search.value.trim().toLowerCase();
    const list = users.filter((u) => (!q || (u.email + " " + u.name).toLowerCase().includes(q)) &&
      (!role.value || (role.value === "admin") === u.isAdmin) && (!status.value || u.status === status.value));
    count.textContent = plural(list.length, "user");
    holder.replaceChildren(dataTable({ rows: list, sortIndex: 8, onRow: (u) => (location.href = "admin-user.html?id=" + encodeURIComponent(u.userId)), empty: "No users match these filters.", columns: [
      { label: "User", value: (u) => u.name || u.email, render: (u) => el("div", { class: "sym" }, el("div", null, userLink(u.userId, u.name || "No display name"), el("span", null, u.email || u.userId))) },
      { label: "Role", value: (u) => (u.isAdmin ? 0 : 1), render: (u) => (u.isAdmin ? pill("Admin", "admin") : pill("Member")) },
      { label: "Status", value: (u) => u.status, render: (u) => pill(u.status, u.status === "Active" ? "ok" : "bad") },
      { label: "Value", num: true, value: (u) => u.valueCents, render: (u) => money(u.valueCents) },
      { label: "Return", num: true, value: (u) => u.returnPct, render: (u) => percent(u.returnPct) },
      { label: "Orders", num: true, value: (u) => u.trades, render: (u) => u.trades + (u.rejected ? " (" + u.rejected + " rejected)" : "") },
      { label: "Challenges", num: true, hideSm: true, value: (u) => u.games, render: (u) => String(u.games) },
      { label: "Joined", hideSm: true, value: (u) => u.createdAt, render: (u) => formatDate(u.createdAt) },
      { label: "Last active", value: (u) => u.lastSeenAt, render: (u) => timeEl(u.lastSeenAt) }] }));
  }
  [search, role, status].forEach((c) => c.addEventListener("input", draw));
  const exportButton = el("button", { type: "button", class: "btn", onclick: () => csvDownload("marketstreet-users.csv",
    ["User ID", "Email", "Display name", "Role", "Status", "Value", "Return %", "Orders", "Rejected", "Challenges", "Joined", "Last active"],
    users.map((u) => [u.userId, u.email, u.name, u.isAdmin ? "Admin" : "Member", u.status, (u.valueCents / 100).toFixed(2), (u.returnPct * 100).toFixed(2), u.trades, u.rejected, u.games, u.createdAt, u.lastSeenAt])) }, "Export CSV");
  content.replaceChildren(
    head("Users", "Everyone with a MarketStreet account.", exportButton, refreshButton(renderUsers)),
    el("section", { class: "panel flush" }, el("div", { class: "filters" }, search, role, status, count), holder));
  draw();
  markUpdated();
}

// ======================= ONE USER =======================

async function renderUser() {
  const id = new URLSearchParams(location.search).get("id") || "";
  setCrumbs([["Users", "admin-users.html"], ["User"]]);
  loading();
  let d;
  let me;
  try {
    [d, me] = await Promise.all([api("/admin/users/" + encodeURIComponent(id)), loadMe()]);
  } catch (e) {
    if (e.status === 404) return content.replaceChildren(el("div", { class: "panel" }, emptyState("User not found", "They may not have signed in yet.", el("a", { class: "btn primary", href: "admin-users.html" }, "Back to users"))));
    return failed(e, renderUser);
  }
  const u = d.user;
  const self = u.userId === me.user.userId;
  const who = u.email || u.userId;
  setCrumbs([["Users", "admin-users.html"], [u.name || who]]);
  document.title = (u.name || who) + " – MarketStreet Admin";

  async function run(action, body, done) {
    try {
      const result = await api("/admin/users/" + encodeURIComponent(u.userId) + "/actions", { method: "POST", body: { action, ...body } });
      toast(result.message || done);
      renderUser();
    } catch (e) {
      toast(e.message, "bad");
    }
  }

  const actions = el("div", { class: "button-row" },
    el("button", { type: "button", class: "btn", onclick: async () => {
      const amount = el("input", { type: "number", id: "adjustAmount", step: "0.01", placeholder: "e.g. 500 or -250" });
      const ok = await confirmAction({ title: "Adjust cash for " + who, message: "Add or remove paper cash. Use a minus sign to remove. Cash can't go below $0.", confirmLabel: "Adjust cash", reason: true,
        extra: el("div", { class: "field" }, el("label", { for: "adjustAmount" }, "Amount in dollars"), amount) });
      if (!ok) return;
      const amountCents = Math.round(Number(amount.value) * 100);
      if (!Number.isSafeInteger(amountCents) || amountCents === 0) return toast("Enter an amount other than $0.", "bad");
      run("adjust-cash", { amountCents, reason: ok.reason }, "Cash adjusted.");
    } }, "Adjust cash"),
    el("button", { type: "button", class: "btn", onclick: async () => {
      const ok = await confirmAction({ title: "Sign " + who + " out everywhere?", message: "Every session they have ends now. They can sign in again right away.", confirmLabel: "Sign out everywhere", reason: true });
      if (ok) run("sign-out", { reason: ok.reason });
    } }, "Sign out everywhere"),
    u.isAdmin
      ? el("button", { type: "button", class: "btn", disabled: self, title: self ? "You can't remove your own admin role." : null, onclick: async () => {
        const ok = await confirmAction({ title: "Remove admin role?", message: who + " will lose access to the admin console on their next request.", confirmLabel: "Remove admin role", reason: true });
        if (ok) run("remove-admin", { reason: ok.reason });
      } }, "Remove admin")
      : el("button", { type: "button", class: "btn", onclick: async () => {
        const ok = await confirmAction({ title: "Make " + who + " an admin?", message: "Admins can see every account and change balances, roles and access.", confirmLabel: "Make admin", reason: true });
        if (ok) run("make-admin", { reason: ok.reason });
      } }, "Make admin"),
    u.status === "Disabled"
      ? el("button", { type: "button", class: "btn", onclick: async () => {
        const ok = await confirmAction({ title: "Enable " + who + "?", message: "They'll be able to sign in and trade again.", confirmLabel: "Enable user", reason: true });
        if (ok) run("enable", { reason: ok.reason });
      } }, "Enable user")
      : el("button", { type: "button", class: "btn danger", disabled: self, title: self ? "You can't disable your own account." : null, onclick: async () => {
        const ok = await confirmAction({ title: "Disable " + who + "?", message: "Every request from this account is refused until an admin enables it again. Their data is kept.", confirmLabel: "Disable user", danger: true, reason: true });
        if (ok) run("disable", { reason: ok.reason });
      } }, "Disable user"),
    el("button", { type: "button", class: "btn danger", onclick: async () => {
      const ok = await confirmAction({ title: "Reset this paper account?", message: "Cash goes back to $10,000 and every holding is removed. Their order history is kept. This can't be undone.", confirmLabel: "Reset account", danger: true, typeToConfirm: who, reason: true });
      if (ok) run("reset-account", { confirm: who, reason: ok.reason });
    } }, "Reset account"));

  const value = d.account ? d.account.cashCents + d.positions.reduce((s, p) => s + p.valueCents, 0) : START_CASH_CENTS;
  const tabs = {
    Portfolio: () => el("div", null,
      el("dl", { class: "kpis" }, kpi("Account value", money(value)), kpi("Cash", d.account ? money(d.account.cashCents) : "—"), kpi("Return", percent(u.returnPct)), kpi("Holdings", plural(d.positions.length, "stock"))),
      d.account && d.account.resetAt ? el("p", { class: "note", style: "margin-bottom: 12px" }, "Last reset " + formatTime(d.account.resetAt, true)) : null,
      el("section", { class: "panel flush" }, dataTable({ rows: d.positions, sortIndex: 3, empty: "No holdings. This account is all cash.", columns: [
        { label: "Stock", value: (p) => p.symbol, render: (p) => el("strong", { class: "mono" }, p.symbol) },
        { label: "Shares", num: true, value: (p) => p.shares, render: (p) => p.shares.toLocaleString("en-US") },
        { label: "Price", num: true, render: (p) => money(p.priceCents) },
        { label: "Value", num: true, value: (p) => p.valueCents, render: (p) => money(p.valueCents) }] }))),
    Orders: () => el("section", { class: "panel flush" }, dataTable({ rows: d.trades, sortIndex: 0, empty: "No orders yet.", columns: [
      { label: "Submitted", value: (t) => t.submittedAt, render: (t) => el("span", { title: formatTime(t.submittedAt, true) }, formatTime(t.submittedAt)) },
      { label: "Order", value: (t) => t.stockSymbol, render: (t) => orderText(t) },
      { label: "Status", value: (t) => t.status, render: tradeStatus },
      { label: "Price", num: true, render: (t) => (t.executionPrice ? money(cents(t.executionPrice)) : "—") },
      { label: "Total", num: true, value: (t) => t.transactionValue || 0, render: (t) => (t.transactionValue ? money(cents(t.transactionValue)) : "—") },
      { label: "Reference", hideSm: true, render: (t) => el("span", { class: "mono muted", title: t.transactionId }, shortId(t.transactionId)) }] })),
    Challenges: () => el("section", { class: "panel flush" }, gamesTable(d.games, false)),
    Activity: () => el("section", { class: "panel flush" }, auditTable(d.audit, false))
  };
  const tabList = el("div", { class: "tabs", role: "tablist" });
  const panel = el("div", { role: "tabpanel" });
  function show(name) {
    tabList.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.textContent.startsWith(name))));
    panel.replaceChildren(tabs[name]());
  }
  const counts = { Orders: d.trades.length, Challenges: d.games.length, Activity: d.audit.length };
  tabList.append(...Object.keys(tabs).map((name) => el("button", { type: "button", role: "tab", onclick: () => show(name) }, name + (counts[name] ? " (" + counts[name] + ")" : ""))));

  content.replaceChildren(
    el("div", { class: "page-head" },
      el("div", { class: "profile-head", style: "margin: 0" },
        el("span", { class: "avatar lg" }, initials(u.name || u.email)),
        el("div", null,
          el("h1", null, u.name || "No display name", " ", u.isAdmin ? pill("Admin", "admin") : null, " ", pill(u.status, u.status === "Active" ? "ok" : "bad"), self ? pill("You", "info") : null),
          el("p", null, u.email || "Email not known yet"),
          el("p", { class: "note" }, "User ID ", el("span", { class: "mono" }, u.userId), el("button", { type: "button", class: "copy", onclick: () => navigator.clipboard.writeText(u.userId).then(() => toast("User ID copied.")) }, "Copy"),
            " · Joined " + formatDate(u.createdAt) + " · Last active ", timeEl(u.lastSeenAt))))),
    el("div", { style: "margin-bottom: 24px" }, actions),
    tabList, panel);
  show("Portfolio");
  markUpdated();
}

// ======================= TRADES =======================

async function renderTrades() {
  setCrumbs([["Trades"]]);
  loading();
  let trades;
  try {
    trades = (await api("/admin/trades")).trades;
  } catch (e) {
    return failed(e, renderTrades);
  }
  const status = el("select", { "aria-label": "Status" }, el("option", { value: "" }, "Any status"), el("option", null, "Accepted"), el("option", null, "Rejected"));
  const symbols = [...new Set(trades.map((t) => t.stockSymbol).filter(Boolean))].sort();
  const symbol = el("select", { "aria-label": "Stock" }, el("option", { value: "" }, "All stocks"), symbols.map((s) => el("option", null, s)));
  const search = el("input", { type: "search", placeholder: "Search user or reference", "aria-label": "Search trades" });
  const count = el("span", { class: "muted", style: "margin-left: auto" });
  const holder = el("div");
  function draw() {
    const q = search.value.trim().toLowerCase();
    const list = trades.filter((t) => (!status.value || t.status === status.value) && (!symbol.value || t.stockSymbol === symbol.value) &&
      (!q || (t.ownerEmail + " " + t.ownerName + " " + shortId(t.transactionId) + " " + t.transactionId).toLowerCase().includes(q)));
    count.textContent = plural(list.length, "order");
    holder.replaceChildren(tradesTable(list));
  }
  [status, symbol, search].forEach((c) => c.addEventListener("input", draw));
  const exportButton = el("button", { type: "button", class: "btn", onclick: () => csvDownload("marketstreet-trades.csv",
    ["Transaction ID", "Submitted", "User", "Type", "Symbol", "Shares", "Status", "Reason", "Price", "Total"],
    trades.map((t) => [t.transactionId, t.submittedAt, t.ownerEmail, t.tradeType, t.stockSymbol, t.shareQuantity, t.status, t.rejectionReason, t.executionPrice, t.transactionValue])) }, "Export CSV");
  content.replaceChildren(
    head("Trades", "Every order on the platform, Accepted and Rejected. Records are never changed or deleted.", exportButton, refreshButton(renderTrades)),
    el("section", { class: "panel flush" }, el("div", { class: "filters" }, search, status, symbol, count), holder));
  draw();
  markUpdated();
}

// ======================= GAMES =======================

function gameProgress(g) {
  const s = typeof SCENARIOS !== "undefined" && SCENARIOS.find((x) => x.id === g.scenarioId);
  return s ? "Day " + Math.min(g.day - s.start + 1, s.dates.length - s.start) + " of " + (s.dates.length - s.start) : "Day " + g.day;
}

function gamesTable(games, withPlayer = true) {
  const columns = [
    withPlayer ? { label: "Player", value: (g) => g.ownerEmail, render: (g) => (g.ownerId ? userLink(g.ownerId, g.ownerName || g.ownerEmail) : g.ownerEmail || "—") } : null,
    { label: "Challenge", value: (g) => scenarioName(g.scenarioId), render: (g) => scenarioName(g.scenarioId) },
    { label: "Progress", render: gameProgress },
    { label: "Status", value: (g) => g.status, render: (g) => (g.status === "over" ? pill("Finished", "ok") : pill("In progress", "info")) },
    { label: "Stars", num: true, value: (g) => g.stars ?? -1, render: (g) => (g.stars === null ? "—" : el("span", { class: "mono", "aria-label": g.stars + " of 3 stars" }, g.stars + " / 3")) },
    { label: "Return", num: true, value: (g) => g.returnPct ?? -Infinity, render: (g) => (g.returnPct === null ? "—" : percent(g.returnPct, 1)) },
    { label: "Last move", value: (g) => g.updatedAt, render: (g) => timeEl(g.updatedAt) }
  ].filter(Boolean);
  return dataTable({ rows: games, columns, onRow: (g) => { if (g.gameId) location.href = "admin-game.html?id=" + encodeURIComponent(g.gameId); }, sortIndex: columns.length - 1, empty: "No challenges played yet." });
}

async function renderGame() {
  const id = new URLSearchParams(location.search).get("id") || "";
  setCrumbs([["Games", "admin-games.html"], ["Game"]]);
  loading();
  let g;
  try {
    g = (await api("/games/" + encodeURIComponent(id))).game;
  } catch (e) {
    if (e.status === 404) return content.replaceChildren(el("div", { class: "panel" }, emptyState("Game not found", null, el("a", { class: "btn primary", href: "admin-games.html" }, "Back to games"))));
    return failed(e, renderGame);
  }
  const name = scenarioName(g.scenarioId);
  const s = typeof SCENARIOS !== "undefined" && SCENARIOS.find((x) => x.id === g.scenarioId);
  const r = g.result;
  const over = g.status === "over";
  setCrumbs([["Games", "admin-games.html"], [name]]);
  document.title = name + " – MarketStreet Admin";
  const last = g.closes.length ? g.closes[g.closes.length - 1].value : null;
  const ret = (v) => (r ? percent(v, 1) : "—");
  const points = g.closes.map((c) => [c.date, c.value / 100]);
  content.replaceChildren(
    head(name, el("span", null, g.ownerId ? userLink(g.ownerId, g.ownerName || g.ownerEmail) : g.ownerEmail || "—", " · started " + formatTime(g.createdAt) + " · ", gameProgress(g))),
    el("dl", { class: "kpis" },
      kpi(over ? "Final value" : "Current value", last === null ? "—" : money(last)),
      kpi("You", ret(r && r.mine)),
      kpi("Bot", ret(r && r.bot)),
      kpi("Market", ret(r && r.market)),
      kpi("Trades", String(g.log.filter((l) => l.who === "You").length)),
      kpi("Stars", r ? r.stars + " / 3" : "—")),
    el("section", { class: "panel" }, el("h2", null, "Value over the game"), el("div", { class: "chart", "data-height": "220", "data-points": JSON.stringify(points) })),
    el("section", { class: "panel flush" }, el("h2", null, "Trade log"), dataTable({
      rows: g.log,
      empty: "No trades yet.",
      columns: [
        { label: "Day", render: (l) => (s && s.dates[l.day]) || "Day " + l.day },
        { label: "Who", render: (l) => l.who },
        { label: "Side", render: (l) => l.side },
        { label: "Shares", num: true, render: (l) => l.qty },
        { label: "Symbol", render: (l) => l.symbol },
        { label: "Price", num: true, render: (l) => money(l.price) }
      ]
    })));
  const badge = pill(over ? "Finished" : "In progress", over ? "ok" : "info");
  content.querySelector(".page-head h1").after(badge);
  window.drawCharts();
  markUpdated();
}

async function renderGames() {
  setCrumbs([["Games"]]);
  loading();
  let games;
  try {
    games = (await api("/admin/games")).games;
  } catch (e) {
    return failed(e, renderGames);
  }
  const status = el("select", { "aria-label": "Status" }, el("option", { value: "" }, "Any status"), el("option", { value: "active" }, "In progress"), el("option", { value: "over" }, "Finished"));
  const scenario = el("select", { "aria-label": "Challenge" }, el("option", { value: "" }, "All challenges"), (typeof SCENARIOS !== "undefined" ? SCENARIOS : []).map((s) => el("option", { value: s.id }, s.name)));
  const count = el("span", { class: "muted", style: "margin-left: auto" });
  const holder = el("div");
  function draw() {
    const list = games.filter((g) => (!status.value || g.status === status.value) && (!scenario.value || g.scenarioId === scenario.value));
    count.textContent = plural(list.length, "game");
    holder.replaceChildren(gamesTable(list));
  }
  [status, scenario].forEach((c) => c.addEventListener("input", draw));
  const finished = games.filter((g) => g.status === "over");
  content.replaceChildren(
    head("Games", "Every Scenario Mode challenge, newest first.", refreshButton(renderGames)),
    el("dl", { class: "kpis" },
      kpi("Games started", String(games.length)),
      kpi("Finished", String(finished.length), games.length ? Math.round((finished.length / games.length) * 100) + "% completion" : null),
      kpi("Players", String(new Set(games.map((g) => g.ownerId || g.ownerEmail)).size)),
      kpi("Three-star finishes", String(finished.filter((g) => g.stars === 3).length))),
    el("section", { class: "panel flush" }, el("div", { class: "filters" }, scenario, status, count), holder));
  draw();
  markUpdated();
}

// ======================= AUDIT LOG =======================

function auditDetails(e) {
  const detail = {};
  if (e.before !== undefined) detail.before = e.before;
  if (e.after !== undefined) detail.after = e.after;
  if (e.path) detail.path = e.path;
  const parts = [];
  if (e.reason) parts.push(el("div", null, "“" + e.reason + "”"));
  if (Object.keys(detail).length) parts.push(el("details", { class: "json" }, el("summary", null, "Before and after"), el("pre", null, JSON.stringify(detail, null, 2))));
  return parts.length ? el("div", null, parts) : el("span", { class: "muted" }, "—");
}

function auditTable(entries, withActor = true) {
  const columns = [
    { label: "When", value: (e) => e.at, render: (e) => el("span", { title: formatTime(e.at, true) }, formatTime(e.at)) },
    withActor ? { label: "By", value: (e) => e.actorEmail, render: (e) => userLink(e.actorId, e.actorEmail) } : { label: "By", render: (e) => e.actorEmail || "—" },
    { label: "Action", value: (e) => e.action, render: (e) => pill(ACTIONS[e.action] || e.action, e.result === "failure" ? "bad" : e.action.startsWith("user.role") ? "admin" : "") },
    withActor ? { label: "Target", value: (e) => e.targetEmail, render: (e) => (e.targetId ? userLink(e.targetId, e.targetEmail || "User") : "—") } : null,
    { label: "Details", render: auditDetails }
  ].filter(Boolean);
  return dataTable({ rows: entries, columns, sortIndex: 0, pageSize: 30, empty: "Nothing recorded yet." });
}

async function renderAudit() {
  setCrumbs([["Audit log"]]);
  loading();
  let entries;
  try {
    entries = (await api("/admin/audit")).entries;
  } catch (e) {
    return failed(e, renderAudit);
  }
  const action = el("select", { "aria-label": "Action" }, el("option", { value: "" }, "All actions"), [...new Set(entries.map((e) => e.action))].sort().map((a) => el("option", { value: a }, ACTIONS[a] || a)));
  const search = el("input", { type: "search", placeholder: "Search by email", "aria-label": "Search the audit log" });
  const count = el("span", { class: "muted", style: "margin-left: auto" });
  const holder = el("div");
  function draw() {
    const q = search.value.trim().toLowerCase();
    const list = entries.filter((e) => (!action.value || e.action === action.value) && (!q || ((e.actorEmail || "") + " " + (e.targetEmail || "")).toLowerCase().includes(q)));
    count.textContent = plural(list.length, "entry").replace("entrys", "entries");
    holder.replaceChildren(auditTable(list));
  }
  [action, search].forEach((c) => c.addEventListener("input", draw));
  content.replaceChildren(
    head("Audit log", "Every admin action, account change and refused admin request. Entries can't be edited or deleted.", refreshButton(renderAudit)),
    el("section", { class: "panel flush" }, el("div", { class: "filters" }, search, action, count), holder));
  draw();
  markUpdated();
}

// ======================= START =======================

const RENDER = { overview: renderOverview, users: renderUsers, user: renderUser, trades: renderTrades, games: renderGames, game: renderGame, audit: renderAudit };
requireAdmin().then((ok) => { if (ok) RENDER[PAGE](); });
