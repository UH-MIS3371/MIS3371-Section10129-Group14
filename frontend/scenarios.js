// MarketStreet Scenarios: replay a real market period, one trading day every few seconds.
// Prototype: the game runs in the browser only. Nothing is sent to the server yet.

const START_CASH = 10000000; // $100,000 in cents
const SPEEDS = [[10, "1×"], [5, "2×"], [2, "5×"], [1, "10×"]]; // seconds per trading day
const TICK_MS = 250;
const $ = (id) => document.getElementById(id);

// Each scenario's colour and a line of context shown before it starts
const THEMES = {
  "crisis-2008": { hue: "#d08a5a", context: "Mortgage losses are spreading through Wall Street, and banks like BAC, C and GS hold a lot of them." },
  "dotcom-2000": { hue: "#9b7be0", context: "Tech stocks are priced for years of perfect growth. Investors are starting to ask when the profits arrive." },
  "covid-2020": { hue: "#3fb0c9", context: "A new virus is spreading. Airlines and cruise lines need people to travel; Zoom needs them to stay home." },
  "meme-2021": { hue: "#e07bc0", context: "Hedge funds have bet heavily against GameStop, and traders on Reddit have noticed." },
  "rates-2022": { hue: "#d9b24a", context: "Inflation is the highest in 40 years and the Fed is about to raise rates. Growth stocks are the most exposed." }
};

let game = null;
let chosen = SCENARIOS[0];
let speed = 5;
const view = { range: 126, type: "candles", mas: [] };

// During a day the price moves open → low → high → close (or open → high → low → close on a down day),
// so it always stays inside that day's real range and ends on the real close.
function pathOf(bar) {
  const [open, high, low, close] = bar;
  return close >= open ? [open, low, high, close] : [open, high, low, close];
}

function priceAt(bar, progress) {
  const path = pathOf(bar);
  const leg = Math.min(Math.floor(progress * 3), 2);
  const t = progress * 3 - leg;
  return Math.round((path[leg] + (path[leg + 1] - path[leg]) * t) * 100);
}

// Today's candle so far: real open, the highest and lowest price reached yet, and the current price
function liveBar(bar, progress) {
  const now = priceAt(bar, progress) / 100;
  const reached = pathOf(bar).slice(0, Math.floor(progress * 3) + 1).concat(now);
  return [bar[0], Math.max(...reached), Math.min(...reached), now, Math.round(bar[4] * progress)];
}

function price(symbol) {
  return priceAt(game.s.stocks[symbol].bars[game.day], game.progress);
}

function prevClose(symbol) {
  const bars = game.s.stocks[symbol].bars;
  return Math.round((game.day ? bars[game.day - 1][3] : bars[0][0]) * 100);
}

// Works for the player (game) and for the bot (game.bot): both have cash and holdings
function totalValue(account = game) {
  let total = account.cash;
  for (const symbol in account.holdings) total += account.holdings[symbol] * price(symbol);
  return total;
}

function benchStart() {
  return Math.round(game.s.stocks[game.s.benchmark].bars[game.s.start][0] * 100);
}

function benchReturn() {
  return price(game.s.benchmark) / benchStart() - 1;
}

// Every trade by you or the bot goes into one log: the trades table and the chart markers read it
function record(who, side, qty, symbol, cents) {
  game.log.push({ day: game.day, who, side, qty, symbol });
  $("tradeRows").prepend(el("tr", { class: who === "Bot" ? "by-bot" : null },
    el("td", { class: "mono" }, shortDate(game.s.dates[game.day])),
    el("td", null, who),
    el("td", null, side + " " + qty + " " + symbol),
    el("td", { class: "right mono" }, money(cents)),
    el("td", { class: "right mono" }, money(qty * cents))));
}

// A stock's close on a day and its average close over the 20 days up to then.
// The bot trades on this, and the "How the bot works" panel shows it.
function trend(symbol, day) {
  const bars = game.s.stocks[symbol].bars.slice(day - 19, day + 1);
  return { close: bars.at(-1)[3], average: bars.reduce((sum, bar) => sum + bar[3], 0) / bars.length };
}

// The bot follows the trend. At each close it sells any stock that closed below its 20-day average,
// then buys the stocks above their average that it does not own yet. Each stock gets at most an equal
// share of the bot's value, so when most stocks are falling the bot keeps most of its money in cash.
function botTrade() {
  const bot = game.bot;
  const symbols = Object.keys(game.s.stocks);
  const above = symbols.filter((symbol) => {
    const t = trend(symbol, game.day);
    return t.close > t.average;
  });
  for (const symbol in bot.holdings) {
    if (above.includes(symbol)) continue;
    bot.cash += bot.holdings[symbol] * price(symbol);
    record("Bot", "Sell", bot.holdings[symbol], symbol, price(symbol));
    delete bot.holdings[symbol];
  }
  const buys = above.filter((symbol) => !bot.holdings[symbol]);
  const budget = Math.min(totalValue(bot) / symbols.length, bot.cash / buys.length);
  for (const symbol of buys) {
    const qty = Math.floor(budget / price(symbol));
    if (!qty) continue;
    bot.holdings[symbol] = qty;
    bot.cash -= qty * price(symbol);
    record("Bot", "Buy", qty, symbol, price(symbol));
  }
}

// Account values at each close, starting from $100,000 before the first open
function curve() {
  const now = { date: game.s.dates[game.day], value: totalValue(), bot: totalValue(game.bot), bench: price(game.s.benchmark) };
  return game.closes.concat([now]);
}

// One row per month or year (keyLength 7 = "2008-09", 4 = "2008"). Each period is measured from the
// previous period's last close, so the rows add up to the total return.
function periods(keyLength) {
  let prev = { value: START_CASH, bench: benchStart() };
  const rows = [];
  for (const point of curve()) {
    const key = point.date.slice(0, keyLength);
    if (!rows.length || rows.at(-1).key !== key) rows.push({ key, start: prev });
    rows.at(-1).end = point;
    prev = point;
  }
  return rows;
}

function renderPerformance() {
  const label = (key) => key.length === 4 ? key : new Date(key + "-15T12:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const rows = periods(7).concat(periods(4).map((r) => ({ ...r, year: true })));
  $("perfRows").replaceChildren(...rows.map((r) => {
    const pnl = r.end.value - r.start.value;
    const cells = [el("td", null, label(r.key)), el("td", { class: "right" }), el("td", { class: "right" }), el("td", { class: "right" })];
    setSigned(cells[1], (pnl >= 0 ? "+" : "−") + money(Math.abs(pnl)), pnl >= 0);
    setSigned(cells[2], pct(r.end.value / r.start.value - 1), pnl >= 0);
    setSigned(cells[3], pct(r.end.bench / r.start.bench - 1), r.end.bench >= r.start.bench);
    return el("tr", r.year ? { class: "year" } : null, ...cells);
  }));
}

// Scoreboard: returns, places, the finding under the title and the race chart
function renderScore() {
  const mine = totalValue() / START_CASH - 1;
  const bot = totalValue(game.bot) / START_CASH - 1;
  const market = benchReturn();
  setSigned($("youReturn"), pct(mine), mine >= 0);
  setSigned($("botReturn"), pct(bot), bot >= 0);
  setSigned($("benchReturn"), pct(market), market >= 0);
  const place = 1 + [bot, market].filter((r) => r > mine).length;
  $("youPlace").textContent = ["1st", "2nd", "3rd"][place - 1] + " place";
  $("botHolding").textContent = "Holds " + (Object.keys(game.bot.holdings).join(", ") || "cash");

  const gap = Math.abs(mine - bot) * 100;
  if (!game.closes.length && game.paused) $("finding").textContent = "Start the clock when you are ready. Buy before the open or wait and watch.";
  else if (gap < 0.005) $("finding").textContent = "You and the bot are level.";
  else $("finding").textContent = (mine > bot ? "You lead the bot by " : "The bot leads you by ") + gap.toFixed(2) + " points.";

  const points = [{ value: START_CASH, bot: START_CASH, bench: benchStart() }].concat(curve());
  const length = game.s.dates.length - game.s.start + 1;
  drawSpark($("race"), [
    { values: Array(length).fill(0), cls: "base" },
    { values: points.map((p) => p.bench / benchStart() - 1), cls: "mkt" },
    { values: points.map((p) => p.bot / START_CASH - 1), cls: "bot" },
    { values: points.map((p) => p.value / START_CASH - 1), cls: "you" }
  ], length);
}

function pct(r) {
  return (r >= 0 ? "▲ +" : "▼ −") + Math.abs(r * 100).toFixed(2) + "%";
}

function setSigned(node, text, positive) {
  node.textContent = text;
  node.classList.add("mono");
  node.classList.toggle("up", positive);
  node.classList.toggle("down", !positive);
}

function longDate(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function shortDate(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Toggle buttons: aria-pressed marks the chosen one for screen readers and for the CSS
function press(group, button) {
  for (const b of group.children) b.setAttribute("aria-pressed", String(b === button));
}

function renderSpeeds(group) {
  group.replaceChildren(...SPEEDS.map(([seconds, label]) =>
    el("button", { type: "button", "data-seconds": seconds, "aria-pressed": String(seconds === speed), title: seconds + " s per trading day" }, label)));
}

function chooseSpeed(e) {
  const button = e.target.closest("button");
  if (!button) return;
  speed = Number(button.dataset.seconds);
  press(e.currentTarget, button);
  if (game) game.speed = speed;
  else renderPicker();
}

// ---------- Picker ----------

// Each card shows the market in the year before the scenario, so nothing about the outcome is given away
function renderPicker() {
  $("scenarioList").replaceChildren(...SCENARIOS.map((s) => {
    const card = el("button", { type: "button", class: "scenario" + (s === chosen ? " chosen" : ""), "data-id": s.id, style: "--hue: " + THEMES[s.id].hue },
      el("span", { class: "period mono" }, shortDate(s.dates[s.start]) + ", " + s.dates[s.start].slice(0, 4) + " – " + shortDate(s.dates.at(-1))),
      el("strong", null, s.name),
      el("span", null, THEMES[s.id].context),
      el("span", { class: "spark" }),
      el("span", { class: "spark-label" }, s.benchmark + ", the year before"),
      el("span", { class: "symbols mono" }, Object.keys(s.stocks).join("  ")));
    return card;
  }));
  document.querySelectorAll(".scenario .spark").forEach((box, i) => {
    const s = SCENARIOS[i];
    drawSpark(box, [{ values: s.stocks[s.benchmark].bars.slice(0, s.start).map((b) => b[3]), cls: "you" }]);
  });
  const days = chosen.dates.length - chosen.start;
  $("duration").textContent = days + " trading days · about " + Math.max(1, Math.round((days * speed) / 60)) + " min";
  $("startButton").textContent = "Start " + chosen.name;
  $("startButton").style.setProperty("--accent", THEMES[chosen.id].hue);
}

$("scenarioList").addEventListener("click", (e) => {
  const card = e.target.closest(".scenario");
  if (!card) return;
  chosen = SCENARIOS.find((s) => s.id === card.dataset.id);
  renderPicker();
});

$("startButton").addEventListener("click", startGame);

// ---------- Game ----------

// The game opens paused on the first morning, so the player can look around and buy before the clock runs
function startGame() {
  const symbols = Object.keys(chosen.stocks);
  game = { s: chosen, day: chosen.start, progress: 0, closes: [], log: [], speed, cash: START_CASH, holdings: {}, bot: { cash: START_CASH, holdings: {} }, paused: true, symbol: symbols[0], newsShown: 0 };
  document.body.style.setProperty("--accent", THEMES[chosen.id].hue);
  renderSpeeds($("speedGame"));
  $("scoreTitle").textContent = chosen.name;
  $("benchLabel").textContent = "Market · " + chosen.benchmark;
  $("watchRows").replaceChildren(...symbols.map((symbol) =>
    el("tr", { "data-symbol": symbol, tabindex: "0" },
      el("td", null, el("strong", null, symbol), el("span", { class: "muted" }, chosen.stocks[symbol].name)),
      el("td", { class: "right mono" }), el("td", { class: "right mono" }))));
  $("newsList").replaceChildren();
  $("tradeRows").replaceChildren();
  $("orderMessage").textContent = "";
  $("picker").hidden = true;
  $("game").hidden = false;
  $("clock").hidden = false;
  showPause();
  selectSymbol(game.symbol);
  game.timer = setInterval(tick, TICK_MS);
}

function tick() {
  if (game.paused) return;
  game.progress += TICK_MS / 1000 / game.speed;
  if (game.progress >= 1) {
    if (game.day === game.s.dates.length - 1) return endGame();
    game.progress = 1;
    game.closes.push({ date: game.s.dates[game.day], value: totalValue(), bot: totalValue(game.bot), bench: price(game.s.benchmark) });
    botTrade();
    game.day++;
    game.progress = 0;
  }
  render();
}

function selectSymbol(symbol) {
  game.symbol = symbol;
  $("quoteSymbol").textContent = symbol;
  $("quoteName").textContent = game.s.stocks[symbol].name;
  $("ticketSymbol").textContent = symbol;
  $("orderMessage").textContent = "";
  delete $("chart").dataset.hover;
  render();
}

// Past days are real daily bars; today's bar is still forming. Trades in this stock are marked on it.
function drawPriceChart() {
  const all = game.s.stocks[game.symbol].bars;
  const bars = all.slice(0, game.day).concat([liveBar(all[game.day], game.progress)]);
  const from = view.range ? Math.max(0, bars.length - view.range) : 0;
  const trades = game.log.filter((t) => t.symbol === game.symbol);
  drawMarketChart($("chart"), $("chartReadout"), { dates: game.s.dates, bars, from, type: view.type, mas: view.mas, mark: game.s.start, trades });
}

function render() {
  const date = game.s.dates[game.day];
  $("simDate").textContent = longDate(date);
  $("dayCount").textContent = "Day " + (game.day - game.s.start + 1) + " of " + (game.s.dates.length - game.s.start);

  for (const row of $("watchRows").children) {
    const symbol = row.dataset.symbol;
    const now = price(symbol);
    const base = prevClose(symbol);
    row.cells[1].textContent = money(now);
    setSigned(row.cells[2], pct(now / base - 1), now >= base);
    row.classList.toggle("selected", symbol === game.symbol);
  }

  const now = price(game.symbol);
  const base = prevClose(game.symbol);
  $("quotePrice").textContent = money(now);
  setSigned($("quoteChange"), changeText(now - base, base), now >= base);

  $("totalValue").textContent = money(totalValue());
  $("cash").textContent = money(game.cash);
  $("positionRows").replaceChildren(...Object.keys(game.holdings).map((symbol) =>
    el("tr", null, el("td", null, symbol), el("td", { class: "right mono" }, game.holdings[symbol]),
      el("td", { class: "right mono" }, money(game.holdings[symbol] * price(symbol))))));
  if (!Object.keys(game.holdings).length) {
    $("positionRows").replaceChildren(el("tr", null, el("td", { colspan: "3", class: "muted" }, "No holdings yet")));
  }

  while (game.newsShown < game.s.news.length && game.s.news[game.newsShown][0] <= date) {
    const [day, text] = game.s.news[game.newsShown++];
    $("newsList").prepend(el("li", { class: "fresh" }, el("time", { class: "mono muted", datetime: day }, shortDate(day)), text));
  }

  updateTicket();
  renderScore();
  renderPerformance();
  drawPriceChart();
}

function maxShares(side) {
  return side === "Buy" ? Math.floor(game.cash / price(game.symbol)) : game.holdings[game.symbol] || 0;
}

function updateTicket() {
  const side = document.querySelector("input[name=side]:checked").value;
  const qty = Number($("quantity").value);
  $("orderButton").textContent = side + " " + game.symbol;
  $("estimate").textContent = Number.isSafeInteger(qty) && qty > 0 ? money(qty * price(game.symbol)) : "—";
  $("limitLabel").textContent = side === "Buy" ? "You can afford" : "You own";
  $("limit").textContent = plural(maxShares(side), "share");
}

// Same rules as the backend: whole shares of 1 or more, enough cash to buy, enough shares to sell
function placeOrder(side, qty) {
  if (!Number.isSafeInteger(qty) || qty < 1) return "Quantity must be a positive whole number.";
  const now = price(game.symbol);
  const owned = game.holdings[game.symbol] || 0;
  if (side === "Buy" && qty * now > game.cash) return "Insufficient cash.";
  if (side === "Sell" && qty > owned) return "Insufficient shares.";

  game.cash += (side === "Buy" ? -1 : 1) * qty * now;
  const left = owned + (side === "Buy" ? qty : -qty);
  if (left) game.holdings[game.symbol] = left;
  else delete game.holdings[game.symbol];
  record("You", side, qty, game.symbol, now);
  return null;
}

$("orderForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const side = document.querySelector("input[name=side]:checked").value;
  const qty = Number($("quantity").value);
  const error = placeOrder(side, qty);
  $("orderMessage").textContent = error || side + " " + plural(qty, "share") + " of " + game.symbol + " filled.";
  $("orderMessage").className = error ? "error" : "ok";
  render();
});

$("orderForm").addEventListener("input", updateTicket);

// 25%, 50% or all of what you can buy (or what you own, when selling)
$("partButtons").addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  const max = maxShares(document.querySelector("input[name=side]:checked").value);
  $("quantity").value = Math.max(1, Math.floor(max * Number(button.dataset.part)));
  updateTicket();
});

$("watchRows").addEventListener("click", (e) => {
  const row = e.target.closest("tr");
  if (row) selectSymbol(row.dataset.symbol);
});

$("watchRows").addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    selectSymbol(e.target.closest("tr").dataset.symbol);
  }
});

// While paused the button is the page's main action, so it gets the filled style
function showPause() {
  const fresh = !game.closes.length && game.progress === 0;
  $("pauseButton").textContent = game.paused ? (fresh ? "Start the clock" : "Resume") : "Pause";
  $("pauseButton").className = game.paused ? "primary" : "ghost";
}

function togglePause() {
  game.paused = !game.paused;
  showPause();
  render();
}

$("pauseButton").addEventListener("click", togglePause);

// Space pauses and resumes, unless the user is typing or pressing a button
document.addEventListener("keydown", (e) => {
  if (e.key !== " " || !game || $("game").hidden || e.target.closest("input, button, tr")) return;
  e.preventDefault();
  togglePause();
});

$("speedGame").addEventListener("click", chooseSpeed);
$("speedPick").addEventListener("click", chooseSpeed);

$("rangeButtons").addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  view.range = Number(button.dataset.range);
  press(e.currentTarget, button);
  delete $("chart").dataset.hover;
  drawPriceChart();
});

$("typeButtons").addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  view.type = button.dataset.type;
  press(e.currentTarget, button);
  drawPriceChart();
});

$("maButtons").addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  const on = button.getAttribute("aria-pressed") !== "true";
  button.setAttribute("aria-pressed", String(on));
  view.mas = [...$("maButtons").children].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => Number(b.dataset.ma));
  drawPriceChart();
});

window.addEventListener("resize", () => (game && !$("game").hidden ? render() : renderPicker()));

function endGame() {
  clearInterval(game.timer);
  game.progress = 1;
  game.paused = true;
  render();
  const mine = totalValue() / START_CASH - 1;
  const bot = totalValue(game.bot) / START_CASH - 1;
  const market = benchReturn();
  const count = (who) => game.log.filter((t) => t.who === who).length;
  $("endValue").textContent = money(totalValue());
  setSigned($("endReturn"), pct(mine), mine >= 0);
  setSigned($("endBot"), pct(bot), bot >= 0);
  $("endBenchLabel").textContent = "Market (" + game.s.benchmark + ")";
  setSigned($("endBench"), pct(market), market >= 0);
  $("endVerdict").textContent = (mine > market ? "You beat the market. " : "The market beat you. ") + (mine > bot ? "You beat the bot. " : "The bot beat you. ") + "You made " + plural(count("You"), "trade") + ", the bot made " + count("Bot") + ".";
  $("endDialog").showModal();
}

// "How the bot works": pauses the game and shows what the bot saw at the last close
let resumeAfterInfo = false;

$("botInfoButton").addEventListener("click", () => {
  const day = game.day - 1;
  $("botViewDate").textContent = shortDate(game.s.dates[day]);
  const count = Object.keys(game.s.stocks).length;
  $("botShare").textContent = "with " + count + " stocks, at most 1/" + count + " each";
  $("botView").replaceChildren(...Object.keys(game.s.stocks).map((symbol) => {
    const t = trend(symbol, day);
    const signal = el("td", { class: "right" });
    setSigned(signal, t.close > t.average ? "▲ Above" : "▼ Below", t.close > t.average);
    return el("tr", null, el("td", null, symbol),
      el("td", { class: "right mono" }, t.close.toFixed(2)),
      el("td", { class: "right mono" }, t.average.toFixed(2)),
      signal,
      el("td", { class: "right mono" }, game.bot.holdings[symbol] || "—"));
  }));
  resumeAfterInfo = !game.paused;
  if (resumeAfterInfo) togglePause();
  $("botDialog").showModal();
});

$("botDialogClose").addEventListener("click", () => $("botDialog").close());

$("botDialog").addEventListener("close", () => {
  if (resumeAfterInfo) togglePause();
});

$("endDialog").addEventListener("cancel", (e) => e.preventDefault());

$("againButton").addEventListener("click", () => {
  $("endDialog").close();
  document.body.style.removeProperty("--accent");
  $("game").hidden = true;
  $("clock").hidden = true;
  $("picker").hidden = false;
  renderPicker();
});

renderSpeeds($("speedPick"));
renderPicker();
