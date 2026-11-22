// MarketStreet Weekly League page (demo season): a trading screen for one hardcoded week.
// Market list · price chart · buy/sell ticket · news (today, this week, coming up) · league standings.
// The week, prices and rivals are in league-data.js. One day opens per real day after you join;
// league.html?demo=1 lets a presenter move through the week freely. Everything is kept in this browser.

const DEMO = new URLSearchParams(location.search).get("demo") === "1";

let state = leagueLoad() || leagueFresh();
let symbol = "AAPL";
let side = "Buy";
let message = { text: "", ok: true };

const $id = (id) => document.getElementById(id);
// replaceChildren, skipping the empty (null) parts of a layout
const fill = (node, ...kids) => node.replaceChildren(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));
const today = () => (state.finished ? WEEK.length : state.day);
const priceOf = (s) => PRICES[today()][s];
const changeOf = (s) => PRICES[today()][s] / PRICES[today() - 1][s] - 1;

// ======================= TRADING (same rules as the main app: BR-3, BR-4, BR-5) =======================

function trade(qtyText) {
  const qty = Number(qtyText);
  const price = priceOf(symbol);
  if (state.finished) return (message = { text: "The season is over. Start a new week to trade again.", ok: false });
  if (!/^\d+$/.test(String(qtyText).trim()) || qty < 1) return (message = { text: "Enter a whole number of 1 or more.", ok: false });
  if (side === "Buy" && qty * price > state.cash) return (message = { text: "Insufficient cash. " + qty + " × " + money(price) + " = " + money(qty * price) + ", you have " + money(state.cash) + ".", ok: false });
  if (side === "Sell" && qty > (state.holdings[symbol] || 0)) return (message = { text: "Insufficient shares. You own " + (state.holdings[symbol] || 0) + " " + symbol + ".", ok: false });
  state.cash += (side === "Buy" ? -1 : 1) * qty * price;
  state.holdings[symbol] = (state.holdings[symbol] || 0) + (side === "Buy" ? qty : -qty);
  if (!state.holdings[symbol]) delete state.holdings[symbol];
  state.trades.push({ day: state.day, side, symbol, qty, price });
  leagueSave(state);
  message = { text: (side === "Buy" ? "Bought " : "Sold ") + plural(qty, "share") + " of " + symbol + " at " + money(price) + ".", ok: true };
}

function nextDay() {
  if (state.day === WEEK.length) state.finished = true;
  else state.day++;
  message = { text: "" };
  leagueSave(state);
  draw();
}

function newSeason() {
  state = leagueFresh();
  leagueSave(state);
  message = { text: "" };
  draw();
}

// ======================= TOP BAR: day, next day, rank, streak =======================

function drawBar() {
  const open = leagueUnlocked(state, DEMO);
  const table = leagueStandings(state, today());
  const me = table.find((p) => p.you);
  const last = state.day === WEEK.length;
  const days = el("ol", { class: "league-days", "aria-label": "Days of the week" }, WEEK.map((d, i) => {
    const n = i + 1;
    const status = state.finished || n < state.day ? "done" : n === state.day ? "now" : n <= open ? "ready" : "locked";
    return el("li", { class: status, title: d.day, "aria-current": status === "now" ? "step" : null }, d.day.slice(0, 3), status === "locked" ? " 🔒" : "");
  }));
  const next = state.finished
    ? el("button", { type: "button", class: "btn primary", onclick: newSeason }, "Start a new week")
    : el("button", { type: "button", class: "btn primary", disabled: !last && state.day >= open, onclick: nextDay },
      last ? "Finish the week" : state.day < open ? "Next day →" : "Day " + (state.day + 1) + " opens tomorrow");
  const { count } = learnStreak();
  fill($id("leagueBar"), 
    el("div", { class: "league-title" },
      el("h1", null, "Weekly League ", el("span", { class: "pill" }, "Demo season")),
      el("span", { class: "muted" }, state.finished ? "Season over" : "Day " + state.day + " of " + WEEK.length + " · " + WEEK[state.day - 1].day)),
    days,
    el("div", { class: "league-stats" },
      el("span", { class: "league-stat" }, "🏆 ", el("strong", null, "#" + me.rank), el("span", { class: "muted" }, " of " + table.length)),
      el("span", { class: "league-stat mono" }, money(me.value), " ", el("span", { class: trendClass(me.value - START_CASH) }, percent(me.value / START_CASH - 1, 1))),
      el("a", { class: "league-stat", href: "learn.html", title: "Learning streak" }, "🔥 " + count)),
    el("div", { class: "league-next" }, next, DEMO ? el("small", { class: "muted" }, "Presenter mode") : null));
}

// ======================= MARKET LIST =======================

function drawWatch() {
  fill($id("watchList"), ...Object.keys(LEAGUE_STOCKS).map((s) => {
    const ch = changeOf(s);
    return el("li", null, el("button", { type: "button", class: s === symbol ? "picked" : null, "aria-pressed": String(s === symbol), onclick: () => { symbol = s; message = { text: "" }; draw(); } },
      el("span", { class: "sym" }, el("strong", null, s), el("small", { class: "muted" }, LEAGUE_STOCKS[s].name)),
      el("span", { class: "px mono" }, money(priceOf(s)), el("small", { class: trendClass(ch) }, percent(ch, 1)))));
  }));
}

// ======================= CHART =======================

function drawChartPanel() {
  const ch = changeOf(symbol);
  $id("chartSymbol").textContent = symbol;
  $id("chartName").textContent = LEAGUE_STOCKS[symbol].name;
  $id("chartPrice").textContent = money(priceOf(symbol));
  $id("chartChange").textContent = percent(ch, 2) + " today";
  $id("chartChange").className = "mono " + trendClass(ch);
  $id("leagueChart").dataset.points = JSON.stringify(leagueHistory(symbol, today()));
  if (window.drawCharts) window.drawCharts();
}

// ======================= BUY / SELL TICKET =======================

function drawTicket() {
  const owned = state.holdings[symbol] || 0;
  const price = priceOf(symbol);
  const qty = el("input", { id: "leagueQty", type: "number", min: "1", step: "1", inputmode: "numeric", placeholder: "0" });
  const preview = el("span", { class: "mono" }, "—");
  const update = () => { const n = Number(qty.value); preview.textContent = n > 0 && Number.isInteger(n) ? money(n * price) : "—"; };
  qty.addEventListener("input", update);
  const sideButton = (name) => el("button", { type: "button", class: "side " + name.toLowerCase(), "aria-pressed": String(side === name), onclick: () => { side = name; message = { text: "" }; drawTicket(); } }, name);
  const holdings = Object.entries(state.holdings);
  fill($id("ticket"), 
    el("h2", { class: "panel-head", id: "ticketTitle" }, "Trade ", symbol),
    el("div", { class: "league-sides", role: "group", "aria-label": "Buy or sell" }, sideButton("Buy"), sideButton("Sell")),
    el("form", { class: "league-order", novalidate: true, onsubmit: (e) => { e.preventDefault(); trade(qty.value); draw(); } },
      el("label", { for: "leagueQty" }, "Shares"),
      qty,
      el("p", { class: "row" }, el("span", { class: "muted" }, "Price"), el("span", { class: "mono" }, money(price))),
      el("p", { class: "row" }, el("span", { class: "muted" }, "Estimated total"), preview),
      el("p", { class: "row" }, el("span", { class: "muted" }, side === "Buy" ? "Cash available" : "You own"), el("span", { class: "mono" }, side === "Buy" ? money(state.cash) : plural(owned, "share"))),
      el("button", { type: "submit", class: "btn block league-submit " + side.toLowerCase(), disabled: state.finished }, side + " " + symbol),
      message.text ? el("p", { class: message.ok ? "up" : "error", role: "status" }, message.text) : null),
    el("h3", null, "Your holdings"),
    holdings.length
      ? el("ul", { class: "league-holdings" }, holdings.map(([s, q]) => el("li", null,
        el("button", { type: "button", class: "btn link", onclick: () => { symbol = s; draw(); } }, s),
        el("span", { class: "mono muted" }, q + " sh"),
        el("span", { class: "mono" }, money(q * priceOf(s))))))
      : el("p", { class: "muted" }, "Nothing yet. Pick a stock and buy."));
  update();
}

// ======================= NEWS: today, this week, coming up =======================

function movers(day) {
  return el("div", { class: "league-movers" }, leagueMovers(day).map(([s, pct]) =>
    el("button", { type: "button", class: "league-chip " + trendClass(pct), onclick: () => { symbol = s; draw(); } }, el("strong", null, s), " " + (pct > 0 ? "▲ +" : pct < 0 ? "▼ −" : "") + Math.abs(pct).toFixed(1) + "%")));
}

function drawNews() {
  const day = today();
  const d = WEEK[day - 1];
  const past = WEEK.slice(0, day - 1).map((w, i) => ({ ...w, n: i + 1 })).reverse();
  const upcoming = state.finished ? [] : WEEK.map((w, i) => ({ ...w, n: i + 1 })).filter((w) => w.n > day);
  const finalCard = () => {
    const me = leagueStandings(state, WEEK.length).find((p) => p.you);
    return el("div", { class: "league-final" }, el("span", { class: "pill ok" }, "Season over"), el("h3", null, "You finished #" + me.rank + " of " + (RIVALS.length + 1)),
      el("p", { class: "muted" }, "Final value " + money(me.value) + " (" + percent(me.value / START_CASH - 1, 1) + ")."));
  };
  fill($id("news"), 
    el("h2", { class: "panel-head" }, "News"),
    state.finished ? finalCard() : null,
    el("article", { class: "league-today" },
      el("div", { class: "league-news-top" }, el("span", { class: "pill bad" }, "Breaking · " + d.day), el("span", { class: "muted mono" }, "Day " + day)),
      el("h3", null, d.headline),
      el("p", { class: "muted" }, d.note),
      movers(day)),
    past.length ? el("h3", { class: "league-sub" }, "Earlier this week") : null,
    past.length ? el("ol", { class: "league-feed" }, past.map((w) => el("li", null, el("span", { class: "day mono" }, w.day.slice(0, 3)), el("span", null, w.headline)))) : null,
    upcoming.length ? el("h3", { class: "league-sub" }, "Coming up") : null,
    upcoming.length ? el("ol", { class: "league-feed upcoming" }, upcoming.map((w) => el("li", null, el("span", { class: "day mono" }, w.day.slice(0, 3)), el("span", null, w.preview), el("span", { "aria-label": "locked" }, "🔒")))) : null,
    upcoming.length ? el("p", { class: "note" }, "Only the scheduled event is known, not how the market will react.") : null);
}

// ======================= STANDINGS (the league's leaderboard) =======================

function drawStandings() {
  const day = today();
  const table = leagueStandings(state, day);
  const before = day > 1 ? leagueStandings(state, day - 1) : null;
  fill($id("standings"), 
    el("h2", { class: "panel-head", id: "standingsTitle" }, "Standings", el("span", { class: "muted" }, state.finished ? "Final" : "after " + WEEK[day - 1].day)),
    el("ol", null, table.map((p) => {
      const prev = before && before.find((q) => q.name === p.name && Boolean(q.you) === Boolean(p.you));
      const moved = prev ? prev.rank - p.rank : 0;
      const ret = p.value / START_CASH - 1;
      return el("li", { class: p.you ? "you" : null },
        el("span", { class: "rank mono" }, p.rank),
        el("span", { class: "who" }, el("strong", null, p.name, p.you ? el("span", { class: "you-tag" }, "You") : null), el("small", { class: "muted" }, p.style)),
        el("span", { class: "move " + (moved > 0 ? "up" : moved < 0 ? "down" : "muted") }, moved > 0 ? "▲" + moved : moved < 0 ? "▼" + -moved : "–"),
        el("span", { class: "num mono " + trendClass(ret) }, percent(ret, 1)));
    })));
}

function draw() {
  drawBar();
  drawWatch();
  drawChartPanel();
  drawTicket();
  drawNews();
  drawStandings();
}

draw();
