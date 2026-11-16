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

  // Value of today's holdings on each of the last month's closes, plus cash
  const dates = STOCKS.AAPL.month.map((p) => p[0]);
  const points = dates.map((d, i) => [d, (account.cashCents + positions.reduce((s, p) => s + cents(STOCKS[p.symbol].month[i][1]) * p.shares, 0)) / 100]);
  const chart = document.getElementById("valueChart");
  chart.dataset.points = JSON.stringify(points);
  chart.setAttribute("aria-label", "Portfolio value over the last month, ending at " + money(value));
  drawCharts();
  if (!positions.length) document.getElementById("chartNote").textContent = "You only hold cash right now, so your value is flat. Buy a stock to see it move.";
  return value;
}

function renderPositions(positions) {
  const body = document.getElementById("positions");
  const empty = document.getElementById("positionsEmpty");
  document.getElementById("positionsTable").hidden = !positions.length;
  if (!positions.length) {
    empty.replaceChildren(el("div", { class: "empty" },
      el("strong", null, "You have $10,000 ready to invest"),
      el("p", null, "Pick a stock to see its chart and place your first order."),
      el("div", { class: "suggest", style: "margin-top: 16px; text-align: left" }, SUGGESTED.map((s) =>
        el("a", { href: "trade.html?symbol=" + s }, el("strong", null, s), el("span", null, STOCKS[s].name), el("span", { class: "mono" }, money(priceCents(s))))))));
    return;
  }
  empty.replaceChildren();
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
  if (done === steps.length) return;
  document.getElementById("checklistPanel").hidden = false;
  document.getElementById("checklistCount").textContent = done + " of " + steps.length;
  document.getElementById("checklistBar").style.width = (done / steps.length) * 100 + "%";
  document.getElementById("checklist").replaceChildren(...steps.map(([label, isDone, href]) => el("li", { class: isDone ? "done" : null },
    el("span", { class: "tick", "aria-hidden": "true" }),
    isDone || !href ? el("span", null, label) : el("a", { href }, label),
    el("span", { class: "visually-hidden" }, isDone ? " (done)" : " (to do)"))));
}

function renderRecent(trades) {
  const body = document.getElementById("recent");
  if (!trades.length) {
    body.replaceChildren(el("tr", null, el("td", null, el("p", { class: "muted" }, "Your orders will show up here."))));
    return;
  }
  body.replaceChildren(...trades.slice(0, 5).map((t) => el("tr", { onclick: () => (location.href = "result.html?id=" + t.transactionId) },
    el("td", { "data-label": "Order" }, el("a", { href: "result.html?id=" + t.transactionId }, orderText(t))),
    el("td", { "data-label": "Status" }, statusPill(t.status)),
    el("td", { class: "num", "data-label": "Total" }, t.transactionValue ? money(cents(t.transactionValue)) : "—"),
    el("td", { class: "num muted", "data-label": "When" }, timeEl(t.submittedAt)))));
}

async function renderDashboard() {
  document.getElementById("recent").replaceChildren(...skeletonRows(4, 3));
  try {
    const [me, { trades }] = await Promise.all([loadMe(true), api("/trades"), loadQuotes()]);
    const positions = buildPositions(me.account.holdings, trades, me.account.resetAt);
    const value = renderValue(me.account, positions);
    renderPositions(positions);
    renderBalances(me.account, positions, value);
    renderChecklist(me);
    renderRecent(trades);
    document.getElementById("loadError").replaceChildren();
  } catch (e) {
    document.getElementById("loadError").replaceChildren(errorState("Your portfolio could not be loaded. " + e.message, renderDashboard));
  }
}

renderDashboard();
