// Portfolio dashboard: total value, a month of value history, positions, balances, a first-run checklist
// and recent activity. Cash and holdings come from the server; prices are the simulated ones in data.js.

const SUGGESTED = ["AAPL", "MSFT", "NVDA", "AMZN"];

function stockCell(symbol, name) {
  return el("div", { class: "sym" }, el("div", null, el("strong", null, symbol), el("span", null, name)));
}

function renderValue(account, positions) {
  const value = account.cashCents + positions.reduce((s, p) => s + p.value, 0);
  const allTime = value - START_CASH_CENTS;
  const today = positions.reduce((s, p) => s + p.dayChange, 0);
  document.getElementById("totalValue").textContent = money(value);
  const change = document.getElementById("totalChange");
  change.replaceChildren(
    el("span", { class: trendClass(today) }, signedMoney(today) + " (" + percent(value - today ? today / (value - today) : 0) + ") today"),
    el("span", { class: "muted" }, "  ·  "),
    el("span", null, signedMoney(allTime) + " (" + percent(allTime / START_CASH_CENTS) + ") since you started with " + money(START_CASH_CENTS)));

  renderHero(account, positions, value);
  return value;
}

const dayPct = (s) => (priceCents(s) - cents(STOCKS[s].prev)) / cents(STOCKS[s].prev);

function tile(s) {
  return el("a", { href: "trade.html?symbol=" + s }, el("strong", null, s), el("span", null, STOCKS[s].name),
    el("span", { class: "mono" }, money(priceCents(s)) + "  ", el("span", { class: trendClass(dayPct(s)) }, percent(dayPct(s)))));
}

// A chart once there is something to chart; before that, a clear first step in the same space
function renderHero(account, positions, value) {
  const slot = document.getElementById("heroSlot");
  const note = document.getElementById("chartNote");
  const history = account.history || [];
  const real = history.length >= 2;
  if (!positions.length && !real) {
    slot.replaceChildren(el("div", { class: "panel start-card" },
      el("h2", null, "You have " + money(account.cashCents) + " to invest"),
      el("p", null, "Pick a stock to see its chart. You review every order before it is placed."),
      el("div", { class: "suggest" }, SUGGESTED.slice(0, 3).map(tile))));
    note.textContent = "";
    return;
  }
  const dates = STOCKS.AAPL.month.map((p) => p[0]);
  let points = dates.map((d, i) => [d, (account.cashCents + positions.reduce((s, p) => s + cents(STOCKS[p.symbol].month[i][1]) * p.shares, 0)) / 100]);
  if (real) points = history.map((h) => [new Date(h.date + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }), h.valueCents / 100]);
  let chart = document.getElementById("valueChart");
  if (!chart) {
    chart = el("div", { class: "chart", id: "valueChart", "data-height": "260", style: "min-height: 260px", role: "img" });
    slot.replaceChildren(chart);
  }
  const json = JSON.stringify(points);
  if (chart.dataset.points !== json) {
    chart.dataset.points = json;
    chart.setAttribute("aria-label", "Portfolio value over the last month, ending at " + money(value));
    drawCharts();
  }
  note.textContent = real ? "Your account value at the end of each day you visited." : "Your history starts today. Until then, this shows what you hold priced over the last month of simulated closes.";
}

function renderMovers() {
  const rows = Object.keys(STOCKS).map((s) => [s, dayPct(s)]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 6);
  document.getElementById("movers").replaceChildren(...rows.map(([s, pct]) => el("tr", { onclick: () => (location.href = "trade.html?symbol=" + s) },
    el("td", { "data-label": "Stock" }, el("a", { href: "trade.html?symbol=" + s }, stockCell(s, STOCKS[s].name))),
    el("td", { class: "spark-cell" }, sparkline(STOCKS[s].month.map((p) => p[1]))),
    el("td", { class: "num", "data-label": "Price" }, money(priceCents(s))),
    el("td", { class: "num " + trendClass(pct), "data-label": "Today" }, percent(pct)),
    el("td", { class: "num hide-sm" }, el("a", { class: "btn sm", href: "trade.html?symbol=" + s }, "Trade")))));
}

// One challenge a day, so the home page is never the same two days running
function renderFeatured() {
  const s = SCENARIOS[new Date().getDate() % SCENARIOS.length];
  const when = (i) => new Date(s.dates[i] + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  document.getElementById("featured").replaceChildren(
    el("h3", null, s.name),
    el("p", { class: "muted", style: "margin-top: 4px" }, when(s.start) + " to " + when(s.dates.length - 1) + " · " + plural(s.dates.length - s.start, "trading day")),
    el("p", { style: "margin: 10px 0 16px" }, s.blurb),
    el("a", { class: "btn block", href: "scenarios.html" }, "Play this challenge"));
}

function drawRank(data) {
  const top = data.entries.slice(0, 3);
  const mine = data.entries.find((e) => e.you);
  const rows = mine && !top.includes(mine) ? [...top, mine] : top;
  document.getElementById("rankList").replaceChildren(...(rows.length
    ? rows.map((r) => el("li", { class: r.you ? "you" : null }, el("span", { class: "mono muted" }, "#" + r.rank), el("span", null, r.name + (r.you ? " (you)" : "")), el("span", { class: "mono" }, percent(r.returnPct))))
    : [el("li", { class: "muted" }, "No players are ranked yet.")]));
}

async function loadRank() {
  const path = "/leaderboard?board=portfolio";
  const cached = peek(path);
  if (cached) drawRank(cached);
  try {
    drawRank(await api(path));
  } catch (e) {
    if (!cached) document.getElementById("rankList").replaceChildren(el("li", { class: "muted" }, "The leaderboard could not be loaded."));
  }
}

function renderPositions(positions) {
  const body = document.getElementById("positions");
  document.getElementById("positionsPanel").hidden = !positions.length;
  if (!positions.length) return;
  body.replaceChildren(...positions.map((p) => el("tr", { onclick: () => (location.href = "trade.html?symbol=" + p.symbol) },
    el("td", { "data-label": "Stock" }, el("a", { href: "trade.html?symbol=" + p.symbol }, stockCell(p.symbol, p.name))),
    el("td", { class: "num", "data-label": "Shares" }, p.shares.toLocaleString("en-US")),
    el("td", { class: "num", "data-label": "Price" }, money(p.price)),
    el("td", { class: "num " + trendClass(p.dayChange), "data-label": "Today" }, percent(p.dayPct)),
    el("td", { class: "num", "data-label": "Avg cost" }, p.avg === null ? "—" : money(p.avg)),
    el("td", { class: "num", "data-label": "Total return" }, p.gain === null ? "—" : signedMoney(p.gain) + " " + percent(p.gainPct)),
    el("td", { class: "num", "data-label": "Market value" }, money(p.value)))));
}

function renderBalances(account, positions, value) {
  const invested = positions.reduce((s, p) => s + p.value, 0);
  document.getElementById("balances").replaceChildren(
    el("div", null, el("dt", null, "Buying power"), el("dd", null, money(account.cashCents))),
    el("div", null, el("dt", null, "Invested"), el("dd", null, money(invested))),
    el("div", null, el("dt", null, "Starting balance"), el("dd", null, money(START_CASH_CENTS))),
    el("div", null, el("dt", null, "Holdings"), el("dd", null, plural(positions.length, "stock"))));
  if (positions.length) {
    document.getElementById("allocPanel").hidden = false;
    // One 100% bar: each holding largest first, then cash
    const slices = [...positions.map((p) => [p.symbol, p.value, ""]), ["Cash", account.cashCents, "cash"]];
    const share = (v) => (v / value * 100).toFixed(1) + "%";
    document.getElementById("allocBar").replaceChildren(...slices.map(([label, v, kind]) => el("span", { class: kind || null, style: "flex:" + v, title: label + " " + share(v) })));
    document.getElementById("allocation").replaceChildren(...slices.map(([label, v, kind]) => el("li", { class: kind || null },
      el("i", { "aria-hidden": "true" }), el("span", null, label), el("span", { class: "mono muted" }, money(v)), el("span", { class: "mono right" }, share(v)))));
  }
}

function renderChecklist(me) {
  const steps = [
    ["Create your account", true, null],
    ["Place your first trade", me.stats.trades > 0, "markets.html"],
    ["Start a challenge", me.stats.games > 0, "scenarios.html"],
    ["Finish a challenge", me.stats.finishedGames > 0, "scenarios.html"],
    ["Check the leaderboard", me.stats.finishedGames > 0, "leaderboard.html"]
  ];
  const done = steps.filter((s) => s[1]).length;
  document.getElementById("checklistPanel").hidden = done === steps.length;
  if (done === steps.length) return;
  document.getElementById("checklistCount").textContent = done + " of " + steps.length;
  document.getElementById("checklistBar").style.width = (done / steps.length) * 100 + "%";
  const hints = { "Place your first trade": "Buy one share of any stock.", "Start a challenge": "Replay a real market crisis with $100,000.", "Finish a challenge": "Reach the last trading day to earn stars.", "Check the leaderboard": "See how you rank against other players." };
  const next = steps.findIndex((s) => !s[1]);
  document.getElementById("checklist").replaceChildren(...steps.map(([label, isDone, href], i) => el("li", { class: isDone ? "done" : null },
    el("span", { class: "tick", "aria-hidden": "true" }),
    isDone || !href ? el("span", null, label) : el("div", null, el("a", { href }, label), i === next ? el("p", { class: "note" }, hints[label]) : null),
    el("span", { class: "visually-hidden" }, isDone ? " (done)" : " (to do)"))));
}

function renderRecent(trades) {
  const body = document.getElementById("recent");
  document.getElementById("recentPanel").hidden = !trades.length;
  if (!trades.length) return;
  body.replaceChildren(...trades.slice(0, 5).map((t) => el("tr", { onclick: () => (location.href = "result.html?id=" + t.transactionId) },
    el("td", { "data-label": "Order" }, el("a", { href: "result.html?id=" + t.transactionId }, orderText(t))),
    el("td", { "data-label": "Status" }, statusPill(t.status)),
    el("td", { class: "num", "data-label": "Total" }, t.transactionValue ? money(cents(t.transactionValue)) : "—"),
    el("td", { class: "num muted", "data-label": "When" }, timeEl(t.submittedAt)))));
}

function drawDashboard(me, trades) {
  const positions = buildPositions(me.account.holdings, trades, me.account.resetAt);
  const value = renderValue(me.account, positions);
  renderPositions(positions);
  renderBalances(me.account, positions, value);
  renderChecklist(me);
  renderRecent(trades);
  renderMovers();
}

// Draws the last known portfolio at once, then refreshes it from the server
async function renderDashboard() {
  const me = peek("/me");
  const cached = peek("/trades");
  if (me && cached) drawDashboard(me, cached.trades);
  else {
    document.getElementById("positions").replaceChildren(...skeletonRows(7, 3));
    document.getElementById("recent").replaceChildren(...skeletonRows(4, 3));
  }
  try {
    const [fresh, { trades }] = await Promise.all([loadMe(true), api("/trades"), loadQuotes()]);
    drawDashboard(fresh, trades);
    document.getElementById("loadError").replaceChildren();
  } catch (e) {
    document.getElementById("loadError").replaceChildren(errorState("Your portfolio could not be loaded. " + e.message, renderDashboard));
  }
}

renderFeatured();
loadRank();
renderDashboard();
