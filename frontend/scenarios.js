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

// Works for the player (game) and for the bot (game.bot): both have cash and holdings.
// A short position is negative shares, so it lowers the value when the price rises.
function totalValue(account = game) {
  let total = account.cash;
  for (const symbol in account.holdings) total += account.holdings[symbol] * price(symbol);
  return total;
}

function shortValue() {
  let total = 0;
  for (const symbol in game.holdings) total += Math.max(0, -game.holdings[symbol]) * price(symbol);
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
  $("tradesEmpty").hidden = true;
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

// Account values at each close, plus the current moment
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
    setSigned(cells[1], signedMoney(pnl), pnl >= 0);
    setSigned(cells[2], pct(r.end.value / r.start.value - 1), pnl >= 0);
    setSigned(cells[3], pct(r.end.bench / r.start.bench - 1), r.end.bench >= r.start.bench);
    return el("tr", r.year ? { class: "year" } : null, ...cells);
  }));
}

// The race: you, the bot and the market as returns since the first open
function drawRace(box) {
  const points = [{ value: START_CASH, bot: START_CASH, bench: benchStart() }].concat(curve());
  const length = game.s.dates.length - game.s.start + 1;
  const end = (r) => (r >= 0 ? "+" : "−") + Math.abs(r * 100).toFixed(1) + "%";
  const mine = points.map((p) => p.value / START_CASH - 1);
  const bot = points.map((p) => p.bot / START_CASH - 1);
  const market = points.map((p) => p.bench / benchStart() - 1);
  drawSpark(box, [
    { values: Array(length).fill(0), cls: "base" },
    { values: market, cls: "mkt", label: "Mkt " + end(market.at(-1)) },
    { values: bot, cls: "bot", label: "Bot " + end(bot.at(-1)) },
    { values: mine, cls: "you", label: "You " + end(mine.at(-1)) }
  ], length);
}

// Scoreboard: returns, your place, the finding under the title and the race chart
function renderScore() {
  const mine = totalValue() / START_CASH - 1;
  const bot = totalValue(game.bot) / START_CASH - 1;
  const market = benchReturn();
  setSigned($("youReturn"), pct(mine), mine >= 0);
  setSigned($("botReturn"), pct(bot), bot >= 0);
  setSigned($("benchReturn"), pct(market), market >= 0);
  const place = 1 + [bot, market].filter((r) => r > mine).length;
  $("youPlace").textContent = ["1st", "2nd", "3rd"][place - 1] + " of 3";
  $("botHolding").textContent = "Holds " + (Object.keys(game.bot.holdings).join(", ") || "cash");

  const gap = Math.abs(mine - bot) * 100;
  if (!game.closes.length && !game.log.length) $("finding").textContent = "Pick a stock, place a trade, then start the clock.";
  else if (gap < 0.005) $("finding").textContent = "You and the bot are level.";
  else $("finding").textContent = (mine > bot ? "You lead the bot by " : "The bot leads you by ") + gap.toFixed(2) + " percentage points.";
  drawRace($("race"));
}

function pct(r) {
  return (r >= 0 ? "▲ +" : "▼ −") + Math.abs(r * 100).toFixed(2) + "%";
}

function signedMoney(cents) {
  return (cents >= 0 ? "+" : "−") + money(Math.abs(cents));
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

function periodText(s) {
  return shortDate(s.dates[s.start]) + ", " + s.dates[s.start].slice(0, 4) + " – " + shortDate(s.dates.at(-1));
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
  if (game && !$("game").hidden) game.speed = speed;
  else renderPicker();
}

// ---------- Picker ----------

// Each card shows the market in the year before the scenario, so nothing about the outcome is given away.
// Clicking a card opens its briefing.
function renderPicker() {
  $("speedNote").textContent = "One trading day every " + plural(speed, "second");
  $("scenarioList").replaceChildren(...SCENARIOS.map((s) => {
    const days = s.dates.length - s.start;
    return el("button", { type: "button", class: "scenario", "data-id": s.id, style: "--hue: " + THEMES[s.id].hue },
      el("span", { class: "period mono" }, periodText(s)),
      el("strong", null, s.name),
      el("span", null, THEMES[s.id].context),
      el("span", { class: "spark" }),
      el("span", { class: "spark-label" }, "How " + s.benchmark + " looked going in"),
      el("span", { class: "play" }, el("span", null, days + " trading days · about " + Math.max(1, Math.round((days * speed) / 60)) + " min"), el("b", null, "Play →")));
  }));
  document.querySelectorAll(".scenario .spark").forEach((box, i) => {
    const s = SCENARIOS[i];
    drawSpark(box, [{ values: s.stocks[s.benchmark].bars.slice(0, s.start).map((b) => b[3]), cls: "you" }]);
  });
}

$("scenarioList").addEventListener("click", (e) => {
  const card = e.target.closest(".scenario");
  if (!card) return;
  chosen = SCENARIOS.find((s) => s.id === card.dataset.id);
  $("briefPeriod").textContent = periodText(chosen);
  $("briefTitle").textContent = chosen.name;
  $("briefContext").textContent = THEMES[chosen.id].context;
  $("briefDialog").style.setProperty("--accent", THEMES[chosen.id].hue);
  $("briefDialog").showModal();
});

$("briefStart").addEventListener("click", () => {
  $("briefDialog").close();
  startGame();
  togglePause();
});

$("briefLook").addEventListener("click", () => {
  $("briefDialog").close();
  startGame();
});

$("briefBack").addEventListener("click", () => $("briefDialog").close());

// ---------- Game ----------

// The game opens paused on the first morning, so the player can look around and trade before the clock runs
function startGame() {
  const symbols = Object.keys(chosen.stocks);
  clearInterval(game && game.timer);
  game = {
    s: chosen, day: chosen.start, progress: 0, closes: [], log: [], speed, cash: START_CASH, holdings: {}, cost: {},
    bot: { cash: START_CASH, holdings: {} }, paused: true, over: false, symbol: symbols[0], newsShown: 0,
    news: chosen.news.map(([date, text]) => [chosen.dates.indexOf(date), text])
  };
  document.body.style.setProperty("--accent", THEMES[chosen.id].hue);
  renderSpeeds($("speedGame"));
  $("scoreTitle").textContent = chosen.name;
  $("benchLabel").textContent = "Market · " + chosen.benchmark;
  $("watchRows").replaceChildren(...symbols.map((symbol) =>
    el("tr", { "data-symbol": symbol, tabindex: "0" },
      el("td", null, el("strong", null, symbol), el("span", { class: "muted" }, chosen.stocks[symbol].name)),
      el("td", { class: "right mono" }), el("td", { class: "right mono" }))));
  $("newsList").replaceChildren();
  $("newsEmpty").hidden = false;
  $("newsFlash").hidden = true;
  $("tradeRows").replaceChildren();
  $("tradesEmpty").hidden = false;
  $("orderMessage").textContent = "";
  $("picker").hidden = true;
  $("game").hidden = false;
  $("clock").hidden = false;
  $("progress").hidden = false;
  showPause();
  selectSymbol(game.symbol);
  game.timer = setInterval(tick, TICK_MS);
}

function tick() {
  if (game.paused) return;
  game.progress += TICK_MS / 1000 / game.speed;
  if (game.progress >= 1) closeDay();
  if (!game.over) render();
}

// End of a trading day: record the close, let the bot trade, then move to the next morning.
// If that morning has a headline and "Pause on news" is on, the clock stops so the player can react.
function closeDay() {
  if (game.day === game.s.dates.length - 1) return endGame();
  game.progress = 1;
  game.closes.push({ date: game.s.dates[game.day], value: totalValue(), bot: totalValue(game.bot), bench: price(game.s.benchmark) });
  botTrade();
  game.day++;
  game.progress = 0;
  $("newsFlash").hidden = true;
  if ($("autoPause").checked && game.news.some(([day]) => day === game.day)) {
    game.paused = true;
    showPause();
  }
}

function selectSymbol(symbol) {
  game.symbol = symbol;
  $("quoteSymbol").textContent = symbol;
  $("quoteName").textContent = game.s.stocks[symbol].name;
  $("orderMessage").textContent = "";
  delete $("chart").dataset.hover;
  render();
}

// Past days are real daily bars; today's bar is still forming.
// Trades, headlines and your average cost in this stock are drawn on it.
function drawPriceChart() {
  const all = game.s.stocks[game.symbol].bars;
  const bars = all.slice(0, game.day).concat([liveBar(all[game.day], game.progress)]);
  const from = view.range ? Math.max(0, bars.length - view.range) : 0;
  const shares = game.holdings[game.symbol];
  drawMarketChart($("chart"), $("chartReadout"), {
    dates: game.s.dates, bars, from, type: view.type, mas: view.mas, mark: game.s.start,
    trades: game.log.filter((t) => t.symbol === game.symbol),
    news: game.news.filter(([day]) => day <= game.day),
    position: shares ? { shares, avg: game.cost[game.symbol] / 100 } : null
  });
}

function render() {
  const date = game.s.dates[game.day];
  const days = game.s.dates.length - game.s.start;
  $("simDate").textContent = longDate(date);
  $("dayCount").textContent = "Day " + (game.day - game.s.start + 1) + " of " + days;
  $("dayBar").style.width = ((game.day - game.s.start + game.progress) / days) * 100 + "%";
  $("nextNewsButton").disabled = game.over || game.newsShown >= game.news.length;
  $("nextDayButton").disabled = game.over;

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
  setSigned($("quoteChange"), pct(now / base - 1), now >= base);

  $("totalValue").textContent = money(totalValue());
  $("cash").textContent = money(game.cash);

  // New headlines go to the top of the list and flash above the chart
  while (game.newsShown < game.news.length && game.news[game.newsShown][0] <= game.day) {
    const [day, text] = game.news[game.newsShown++];
    $("newsList").prepend(el("li", { class: "fresh" }, el("time", { class: "mono muted" }, shortDate(game.s.dates[day])), text));
    $("newsEmpty").hidden = true;
    $("newsFlash").textContent = "Breaking · " + shortDate(game.s.dates[day]) + " · " + text;
    $("newsFlash").hidden = false;
  }

  renderPositions();
  updateTicket();
  renderScore();
  renderPerformance();
  drawPriceChart();
}

// Each open position with its average cost and profit or loss so far, and buttons to close it
function renderPositions() {
  const symbols = Object.keys(game.holdings);
  $("tabPositions").textContent = "Positions" + (symbols.length ? " (" + symbols.length + ")" : "");
  if (!symbols.length) {
    $("positionRows").replaceChildren(el("tr", null, el("td", { colspan: "6", class: "empty" },
      "No positions yet. Pick a stock, then Buy if you think it will rise or Short if you think it will fall.")));
    return;
  }
  $("positionRows").replaceChildren(...symbols.map((symbol) => {
    const shares = game.holdings[symbol];
    const now = price(symbol);
    const pnl = (now - game.cost[symbol]) * shares;
    const result = el("td", { class: "right" });
    setSigned(result, signedMoney(pnl) + " (" + pct(pnl / (game.cost[symbol] * Math.abs(shares))).slice(2) + ")", pnl >= 0);
    return el("tr", null,
      el("td", null, el("strong", null, symbol), shares < 0 ? el("span", { class: "badge-short" }, "Short") : null),
      el("td", { class: "right mono" }, Math.abs(shares)),
      el("td", { class: "right mono" }, money(game.cost[symbol])),
      el("td", { class: "right mono" }, money(now)),
      result,
      el("td", { class: "right actions" },
        el("button", { type: "button", "data-close": symbol, "data-part": "1" }, "Close"),
        el("button", { type: "button", "data-close": symbol, "data-part": "0.5" }, "½")));
  }));
}

function chosenSide() {
  return document.querySelector("input[name=side]:checked").value;
}

// What the order would be, and why it can't be placed (if it can't). The button is disabled
// with that reason instead of letting the order fail. Rules: whole shares of 1 or more, enough cash
// to buy, one direction per stock, and shorts worth at most the account's value.
function orderPlan() {
  const side = chosenSide();
  const symbol = game.symbol;
  const now = price(symbol);
  const owned = game.holdings[symbol] || 0;
  const qty = Math.max(0, Math.floor(Math.round(Number($("amount").value) * 100) / now) || 0);
  let reason = "";
  if (game.over) reason = "This scenario is over.";
  else if (side === "Buy" && owned < 0) reason = "You are short " + symbol + ". Close the short in Positions before buying.";
  else if (side === "Short" && owned > 0) reason = "You own " + symbol + ". Close it in Positions before shorting.";
  else if (qty < 1) reason = "Enter at least " + money(now) + " to get one share.";
  else if (side === "Buy" && qty * now > game.cash) reason = "Not enough cash: at most " + plural(Math.floor(game.cash / now), "share") + ".";
  else if (side === "Short" && shortValue() + qty * now > totalValue()) reason = "Short limit: your shorts can be worth at most your account value.";
  return { side, symbol, now, owned, qty, reason };
}

// The most you can put into this order, in dollars
function maxAmount(side) {
  const cents = side === "Buy" ? game.cash : totalValue() - shortValue();
  return Math.max(0, Math.floor(cents / 100));
}

function updateTicket() {
  const plan = orderPlan();
  $("ticketQuote").textContent = plan.symbol + " " + money(plan.now);
  $("previewShares").textContent = plan.qty ? plan.qty + " · " + money(plan.qty * plan.now) : "—";
  $("previewCash").textContent = plan.reason ? "—" : money(game.cash + (plan.side === "Buy" ? -1 : 1) * plan.qty * plan.now);
  $("orderButton").textContent = plan.reason ? plan.side + " " + plan.symbol : plan.side + " " + plan.qty + " " + plan.symbol;
  $("orderButton").dataset.side = plan.side;
  $("orderButton").disabled = Boolean(plan.reason);
  $("orderReason").textContent = plan.reason;
}

// Opens or adds to a position at the current price, keeping the average cost per share up to date
function placeOrder() {
  const plan = orderPlan();
  if (plan.reason) return plan.reason;
  const change = plan.side === "Buy" ? plan.qty : -plan.qty;
  const shares = plan.owned + change;
  game.cost[plan.symbol] = (Math.abs(plan.owned) * (game.cost[plan.symbol] || 0) + plan.qty * plan.now) / Math.abs(shares);
  game.cash -= change * plan.now;
  game.holdings[plan.symbol] = shares;
  record("You", plan.side, plan.qty, plan.symbol, plan.now);
  return null;
}

// Closes all or half of a position: selling shares you own, or buying back shares you shorted
function closePosition(symbol, part) {
  const shares = game.holdings[symbol];
  const qty = part === 1 ? Math.abs(shares) : Math.max(1, Math.floor(Math.abs(shares) / 2));
  const now = price(symbol);
  const change = shares > 0 ? -qty : qty;
  game.cash -= change * now;
  game.holdings[symbol] = shares + change;
  record("You", shares > 0 ? "Sell" : "Cover", qty, symbol, now);
  if (!game.holdings[symbol]) {
    delete game.holdings[symbol];
    delete game.cost[symbol];
  }
}

$("orderForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const plan = orderPlan();
  const error = placeOrder();
  $("orderMessage").textContent = error || plan.side + " " + plural(plan.qty, "share") + " of " + plan.symbol + " filled at " + money(plan.now) + ".";
  $("orderMessage").className = error ? "error" : "ok";
  render();
});

$("orderForm").addEventListener("input", updateTicket);

$("amountChips").addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  $("amount").value = button.dataset.amount === "max" ? maxAmount(chosenSide()) : button.dataset.amount;
  updateTicket();
});

$("positionRows").addEventListener("click", (e) => {
  const button = e.target.closest("button[data-close]");
  if (!button || game.over) return;
  const symbol = button.dataset.close;
  closePosition(symbol, Number(button.dataset.part));
  $("orderMessage").textContent = "Closed " + (button.dataset.part === "1" ? "your " : "half of your ") + symbol + " position.";
  $("orderMessage").className = "ok";
  render();
});

$("tabList").addEventListener("click", (e) => {
  const tab = e.target.closest("[role=tab]");
  if (!tab) return;
  for (const t of $("tabList").children) {
    t.setAttribute("aria-selected", String(t === tab));
    $(t.getAttribute("aria-controls")).hidden = t !== tab;
  }
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
  $("pauseButton").textContent = game.over ? "See results" : game.paused ? (fresh ? "Start the clock" : "Resume") : "Pause";
  $("pauseButton").className = game.paused ? "primary" : "ghost";
}

function togglePause() {
  if (game.over) return $("endDialog").showModal();
  game.paused = !game.paused;
  if (!game.paused) $("newsFlash").hidden = true;
  showPause();
  render();
}

$("pauseButton").addEventListener("click", togglePause);

$("nextDayButton").addEventListener("click", () => {
  closeDay();
  if (!game.over) render();
});

// Runs the days forward to the next headline
$("nextNewsButton").addEventListener("click", () => {
  const next = game.news[game.newsShown];
  if (!next) return;
  while (!game.over && game.day < next[0]) closeDay();
  if (!game.over) render();
});

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

// "How the bot works": pauses the game and shows what the bot saw at the last close
let resumeAfterInfo = false;

$("botInfoButton").addEventListener("click", () => {
  const day = game.day - 1;
  const count = Object.keys(game.s.stocks).length;
  $("botViewDate").textContent = shortDate(game.s.dates[day]);
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
  resumeAfterInfo = !game.paused && !game.over;
  if (resumeAfterInfo) togglePause();
  $("botDialog").showModal();
});

$("botDialogClose").addEventListener("click", () => $("botDialog").close());

$("botDialog").addEventListener("close", () => {
  if (resumeAfterInfo) togglePause();
});

// ---------- End of the scenario ----------

// Stars build on each other: one for making a profit, two for also beating the bot, three for also
// beating the market. Sitting in cash all game earns none.
function endGame() {
  clearInterval(game.timer);
  game.progress = 1;
  game.paused = true;
  game.over = true;
  render();
  showPause();
  const mine = totalValue() / START_CASH - 1;
  const bot = totalValue(game.bot) / START_CASH - 1;
  const market = benchReturn();
  const stars = mine <= 0 ? 0 : mine <= bot ? 1 : mine <= market ? 2 : 3;
  const count = (who) => game.log.filter((t) => t.who === who).length;
  $("endStars").textContent = "★".repeat(stars) + "☆".repeat(3 - stars);
  $("endStars").setAttribute("aria-label", stars + " of 3 stars");
  $("endValue").textContent = money(totalValue());
  setSigned($("endReturn"), pct(mine), mine >= 0);
  setSigned($("endBot"), pct(bot), bot >= 0);
  $("endBenchLabel").textContent = "Market (" + game.s.benchmark + ")";
  setSigned($("endBench"), pct(market), market >= 0);
  $("endVerdict").textContent = (mine > market ? "You beat the market. " : "The market beat you. ") + (mine > bot ? "You beat the bot. " : "The bot beat you. ") +
    "You made " + plural(count("You"), "trade") + ", the bot made " + count("Bot") + ".";

  // The biggest single move in hindsight: buying or shorting one stock on day 1 and holding to the end
  const best = Object.keys(game.s.stocks).map((symbol) => {
    const bars = game.s.stocks[symbol].bars;
    return { symbol, r: bars.at(-1)[3] / bars[game.s.start][0] - 1 };
  }).sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0];
  $("endHindsight").textContent = "Best single bet in hindsight: " + (best.r >= 0 ? "buying " : "shorting ") + best.symbol +
    " on day 1 and holding to the end would have made " + Math.abs(best.r * 100).toFixed(1) + "%.";
  $("endDialog").showModal();
  drawRace($("endRace"));
}

$("againButton").addEventListener("click", () => {
  $("endDialog").close();
  startGame();
});

$("pickButton").addEventListener("click", () => {
  $("endDialog").close();
  document.body.style.removeProperty("--accent");
  $("game").hidden = true;
  $("clock").hidden = true;
  $("progress").hidden = true;
  $("picker").hidden = false;
  renderPicker();
  window.startHeroScene && startHeroScene();
});

$("boardButton").addEventListener("click", () => $("endDialog").close());

renderSpeeds($("speedPick"));
renderPicker();
