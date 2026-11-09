// MarketStreet Scenarios: replay a real market period, one trading day every few seconds.
// The game is saved on the server (POST/GET /api/games...). The rules are in game-core.js, the same file
// the Lambda uses: the page uses it for previews and the animated price, the server's copy decides.

const SPEEDS = [[10, "1×"], [5, "2×"], [2, "5×"], [1, "10×"]]; // seconds per trading day
const TICK_MS = 250;
const GAMES_URL = API_URL.replace(/\/trades$/, "/games");
const SAVED_GAME = "marketstreet-scenario-game";
const $ = (id) => document.getElementById(id);

// Each scenario's colour and a line of context shown before it starts
const THEMES = {
  "crisis-2008": { hue: "#d08a5a", context: "Mortgage losses are spreading through Wall Street, and banks like BAC, C and GS hold a lot of them." },
  "dotcom-2000": { hue: "#9b7be0", context: "Tech stocks are priced for years of perfect growth. Investors are starting to ask when the profits arrive." },
  "covid-2020": { hue: "#3fb0c9", context: "A new virus is spreading. Airlines and cruise lines need people to travel; Zoom needs them to stay home." },
  "meme-2021": { hue: "#e07bc0", context: "Hedge funds have bet heavily against GameStop, and traders on Reddit have noticed." },
  "rates-2022": { hue: "#d9b24a", context: "Inflation is the highest in 40 years and the Fed is about to raise rates. Growth stocks are the most exposed." }
};

// game = the server's saved game plus page-only fields: s (the scenario), speed, paused, timer, symbol,
// newsShown, news and busy (an action is waiting for the server)
let game = null;
let chosen = SCENARIOS[0];
let speed = 5;
const view = { range: 126, type: "candles", mas: [] };

function price(symbol) {
  return GameCore.price(game.s, game, symbol);
}

function totalValue(account) {
  return GameCore.totalValue(game.s, game, account);
}

function prevClose(symbol) {
  const bars = game.s.stocks[symbol].bars;
  return Math.round((game.day ? bars[game.day - 1][3] : bars[0][0]) * 100);
}

function benchReturn() {
  return price(game.s.benchmark) / GameCore.benchStart(game.s) - 1;
}

// Today's candle so far: real open, the highest and lowest price reached yet, and the current price
function liveBar(bar, progress) {
  const now = GameCore.priceAt(bar, progress) / 100;
  const reached = GameCore.pathOf(bar).slice(0, Math.floor(progress * 3) + 1).concat(now);
  return [bar[0], Math.max(...reached), Math.min(...reached), now, Math.round(bar[4] * progress)];
}

// ---------- Talking to the server ----------

async function api(method, url, body) {
  const response = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
  return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) };
}

// Puts the server's game on screen, keeping the page's own fields. Within the same day the animated
// price keeps its place; the server only moves its clock forward.
function applyServer(state) {
  const sameDay = state.day === game.day;
  const progress = game.progress;
  Object.assign(game, state);
  if (sameDay && state.status === "active") game.progress = Math.max(progress, state.progress);
}

// Sends one action (orders, close or advance). The requestId makes the server apply it once, so a
// network failure can be retried with the same requestId without doubling it. The screen only changes
// when the server confirms the save.
async function act(action, body) {
  const request = { requestId: crypto.randomUUID(), day: game.day, progress: Math.min(game.progress, 0.999), ...body };
  game.busy = true;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await api("POST", GAMES_URL + "/" + game.gameId + "/" + action, request);
        if (res.ok) {
          applyServer(res.data.game);
          return res.data;
        }
        if (res.status === 409) await reloadGame();
        return { error: res.data.reason || "Something went wrong. Please try again." };
      } catch (e) {
        // No answer from the server: try once more with the same requestId
      }
    }
    return { error: "Couldn't reach the server. Nothing was saved. Please try again." };
  } finally {
    game.busy = false;
  }
}

async function reloadGame() {
  const res = await api("GET", GAMES_URL + "/" + game.gameId);
  if (res.ok) applyServer(res.data.game);
}

function showMessage(error, success) {
  $("orderMessage").textContent = error || success;
  $("orderMessage").className = error ? "error" : "ok";
}

// ---------- Scores and charts ----------

// Account values at each close, plus the current moment
function curve() {
  const now = { date: game.s.dates[game.day], value: totalValue(), bot: totalValue(game.bot), bench: price(game.s.benchmark) };
  return game.closes.concat([now]);
}

// One row per month or year (keyLength 7 = "2008-09", 4 = "2008"). Each period is measured from the
// previous period's last close, so the rows add up to the total return.
function periods(keyLength) {
  let prev = { value: GameCore.START_CASH, bench: GameCore.benchStart(game.s) };
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
  const start = GameCore.START_CASH;
  const points = [{ value: start, bot: start, bench: GameCore.benchStart(game.s) }].concat(curve());
  const length = game.s.dates.length - game.s.start + 1;
  const end = (r) => (r >= 0 ? "+" : "−") + Math.abs(r * 100).toFixed(1) + "%";
  const mine = points.map((p) => p.value / start - 1);
  const bot = points.map((p) => p.bot / start - 1);
  const market = points.map((p) => p.bench / GameCore.benchStart(game.s) - 1);
  drawSpark(box, [
    { values: Array(length).fill(0), cls: "base" },
    { values: market, cls: "mkt", label: "Mkt " + end(market.at(-1)) },
    { values: bot, cls: "bot", label: "Bot " + end(bot.at(-1)) },
    { values: mine, cls: "you", label: "You " + end(mine.at(-1)) }
  ], length);
}

// Scoreboard: returns, your place, the finding under the title and the race chart
function renderScore() {
  const mine = totalValue() / GameCore.START_CASH - 1;
  const bot = totalValue(game.bot) / GameCore.START_CASH - 1;
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

$("briefStart").addEventListener("click", async () => {
  $("briefDialog").close();
  if (await startGame(chosen)) togglePause();
});

$("briefLook").addEventListener("click", () => {
  $("briefDialog").close();
  startGame(chosen);
});

$("briefBack").addEventListener("click", () => $("briefDialog").close());

// ---------- Game ----------

// Asks the server for a new game; the server sets the game ID, the starting cash and the first day
async function startGame(s) {
  $("pickerMessage").textContent = "Starting…";
  try {
    const res = await api("POST", GAMES_URL, { scenarioId: s.id });
    if (!res.ok) throw new Error(res.data.reason);
    $("pickerMessage").textContent = "";
    try {
      localStorage.setItem(SAVED_GAME, res.data.game.gameId);
    } catch (e) {
      // Blocked storage: the game still works, it just can't be resumed after a refresh
    }
    enterGame(res.data.game);
    return true;
  } catch (e) {
    $("pickerMessage").textContent = "The game could not be started. Please try again.";
    $("picker").hidden = false;
    return false;
  }
}

// Shows a saved game. It opens paused, so the player can look around and trade before the clock runs.
function enterGame(state) {
  const s = SCENARIOS.find((x) => x.id === state.scenarioId);
  const symbols = Object.keys(s.stocks);
  clearInterval(game && game.timer);
  game = {
    ...state, s, speed, paused: true, busy: false, symbol: symbols[0], newsShown: 0,
    news: s.news.map(([date, text]) => [s.dates.indexOf(date), text])
  };
  document.body.style.setProperty("--accent", THEMES[s.id].hue);
  renderSpeeds($("speedGame"));
  $("scoreTitle").textContent = s.name;
  $("benchLabel").textContent = "Market · " + s.benchmark;
  $("watchRows").replaceChildren(...symbols.map((symbol) =>
    el("tr", { "data-symbol": symbol, tabindex: "0" },
      el("td", null, el("strong", null, symbol), el("span", { class: "muted" }, s.stocks[symbol].name)),
      el("td", { class: "right mono" }), el("td", { class: "right mono" }))));
  $("newsList").replaceChildren();
  $("newsEmpty").hidden = false;
  $("orderMessage").textContent = "";
  $("picker").hidden = true;
  $("resumeBar").hidden = true;
  $("game").hidden = false;
  $("clock").hidden = false;
  $("progress").hidden = false;
  showPause();
  selectSymbol(game.symbol);
  $("newsFlash").hidden = true;
  if (game.status === "over") return finish();
  game.timer = setInterval(tick, TICK_MS);
}

function tick() {
  if (game.paused || game.busy) return;
  game.progress = Math.min(1, game.progress + TICK_MS / 1000 / game.speed);
  if (game.progress >= 1) endDay();
  else render();
}

// The server ends the day (and every day up to untilDay): it records the close and runs the bot.
// If a headline arrives and "Pause on news" is on, the clock stops so the player can react.
async function endDay(untilDay) {
  const before = game.day;
  const res = await act("advance", untilDay === undefined ? {} : { untilDay });
  if (res.error) {
    game.progress = Math.min(game.progress, 0.999);
    game.paused = true;
    showPause();
    showMessage("The day was not saved: " + res.error);
    return render();
  }
  if (game.status === "over") return finish();
  $("newsFlash").hidden = true;
  if ($("autoPause").checked && game.news.some(([day]) => day > before && day <= game.day)) {
    game.paused = true;
    showPause();
  }
  render();
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
    position: shares ? { shares, avg: game.basis[game.symbol] / Math.abs(shares) / 100 } : null
  });
}

function render() {
  const date = game.s.dates[game.day];
  const days = game.s.dates.length - game.s.start;
  const over = game.status === "over";
  $("simDate").textContent = longDate(date);
  $("dayCount").textContent = "Day " + (game.day - game.s.start + 1) + " of " + days;
  $("dayBar").style.width = ((game.day - game.s.start + game.progress) / days) * 100 + "%";
  $("nextNewsButton").disabled = over || game.busy || game.newsShown >= game.news.length;
  $("nextDayButton").disabled = over || game.busy;

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

  renderTrades();
  renderPositions();
  updateTicket();
  renderScore();
  renderPerformance();
  drawPriceChart();
}

// The trades table is rebuilt from the saved trade records whenever a new one arrives
function renderTrades() {
  if (game.tradesShown === game.log.length) return;
  game.tradesShown = game.log.length;
  $("tradeRows").replaceChildren(...game.log.slice().reverse().map((t) =>
    el("tr", { class: t.who === "Bot" ? "by-bot" : null },
      el("td", { class: "mono" }, shortDate(game.s.dates[t.day])),
      el("td", null, t.who),
      el("td", null, t.side + " " + t.qty + " " + t.symbol),
      el("td", { class: "right mono" }, money(t.price)),
      el("td", { class: "right mono" }, money(t.qty * t.price)))));
  $("tradesEmpty").hidden = game.log.length > 0;
}

// Each open position with its average cost and profit or loss so far, and buttons to close it.
// basis is what the open shares cost in total.
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
    const basis = game.basis[symbol];
    const now = price(symbol);
    const pnl = now * shares + (shares > 0 ? -basis : basis);
    const result = el("td", { class: "right" });
    setSigned(result, signedMoney(pnl) + " (" + pct(pnl / basis).slice(2) + ")", pnl >= 0);
    return el("tr", null,
      el("td", null, el("strong", null, symbol), shares < 0 ? el("span", { class: "badge-short" }, "Short") : null),
      el("td", { class: "right mono" }, Math.abs(shares)),
      el("td", { class: "right mono" }, money(Math.round(basis / Math.abs(shares)))),
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

function amountCents() {
  return Math.round(Number($("amount").value) * 100);
}

// A preview with the shared rules; the button is disabled with the reason instead of letting the order fail
function updateTicket() {
  const side = chosenSide();
  const plan = GameCore.orderPlan(game.s, game, side, game.symbol, amountCents());
  const now = price(game.symbol);
  $("ticketQuote").textContent = game.symbol + " " + money(now);
  $("previewShares").textContent = plan.qty ? plan.qty + " · " + money(plan.qty * now) : "—";
  $("previewCash").textContent = plan.reason ? "—" : money(game.cash + (side === "Buy" ? -1 : 1) * plan.qty * now);
  $("orderButton").textContent = plan.reason ? side + " " + game.symbol : side + " " + plan.qty + " " + game.symbol;
  $("orderButton").dataset.side = side;
  $("orderButton").disabled = Boolean(plan.reason) || game.busy;
  $("orderReason").textContent = plan.reason;
}

function filledText(res) {
  if (res.duplicate) return "That action was already saved.";
  const t = res.trade;
  return t.side + " " + plural(t.qty, "share") + " of " + t.symbol + " filled at " + money(t.price) + ".";
}

$("orderForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (game.busy || $("orderButton").disabled) return;
  $("orderButton").disabled = true;
  const res = await act("orders", { side: chosenSide(), symbol: game.symbol, amountCents: amountCents() });
  showMessage(res.error, res.error ? "" : filledText(res));
  render();
});

$("orderForm").addEventListener("input", updateTicket);

$("amountChips").addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  $("amount").value = button.dataset.amount === "max" ? Math.floor(GameCore.maxAmount(game.s, game, chosenSide()) / 100) : button.dataset.amount;
  updateTicket();
});

$("positionRows").addEventListener("click", async (e) => {
  const button = e.target.closest("button[data-close]");
  if (!button || game.busy || game.status !== "active") return;
  const res = await act("close", { symbol: button.dataset.close, part: Number(button.dataset.part) });
  showMessage(res.error, res.error ? "" : filledText(res));
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
  $("pauseButton").textContent = game.status === "over" ? "See results" : game.paused ? (fresh ? "Start the clock" : "Resume") : "Pause";
  $("pauseButton").className = game.paused ? "primary" : "ghost";
}

function togglePause() {
  if (game.status === "over") return $("endDialog").showModal();
  game.paused = !game.paused;
  if (!game.paused) {
    $("newsFlash").hidden = true;
    $("orderMessage").textContent = "";
  }
  showPause();
  render();
}

$("pauseButton").addEventListener("click", togglePause);

$("nextDayButton").addEventListener("click", () => endDay());

// Runs the days forward to the morning of the next headline
$("nextNewsButton").addEventListener("click", () => {
  const next = game.news[game.newsShown];
  if (next) endDay(next[0]);
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
    const t = GameCore.trend(game.s, symbol, day);
    const signal = el("td", { class: "right" });
    setSigned(signal, t.close > t.average ? "▲ Above" : "▼ Below", t.close > t.average);
    return el("tr", null, el("td", null, symbol),
      el("td", { class: "right mono" }, t.close.toFixed(2)),
      el("td", { class: "right mono" }, t.average.toFixed(2)),
      signal,
      el("td", { class: "right mono" }, game.bot.holdings[symbol] || "—"));
  }));
  resumeAfterInfo = !game.paused && game.status === "active";
  if (resumeAfterInfo) togglePause();
  $("botDialog").showModal();
});

$("botDialogClose").addEventListener("click", () => $("botDialog").close());

$("botDialog").addEventListener("close", () => {
  if (resumeAfterInfo) togglePause();
});

// ---------- End of the scenario ----------

// The result (stars, returns, best bet in hindsight) is worked out and saved by the server
function finish() {
  clearInterval(game.timer);
  game.paused = true;
  render();
  showPause();
  try {
    localStorage.removeItem(SAVED_GAME);
  } catch (e) {
    // Blocked storage: nothing to remove
  }
  const r = game.result;
  $("endStars").textContent = "★".repeat(r.stars) + "☆".repeat(3 - r.stars);
  $("endStars").setAttribute("aria-label", r.stars + " of 3 stars");
  $("endValue").textContent = money(r.finalValue);
  setSigned($("endReturn"), pct(r.mine), r.mine >= 0);
  setSigned($("endBot"), pct(r.bot), r.bot >= 0);
  $("endBenchLabel").textContent = "Market (" + game.s.benchmark + ")";
  setSigned($("endBench"), pct(r.market), r.market >= 0);
  $("endVerdict").textContent = (r.mine > r.market ? "You beat the market. " : "The market beat you. ") + (r.mine > r.bot ? "You beat the bot. " : "The bot beat you. ") +
    "You made " + plural(r.trades, "trade") + ", the bot made " + r.botTrades + ".";
  $("endHindsight").textContent = "Best single bet in hindsight: " + (r.best.r >= 0 ? "buying " : "shorting ") + r.best.symbol +
    " on day 1 and holding to the end would have made " + Math.abs(r.best.r * 100).toFixed(1) + "%.";
  $("endDialog").showModal();
  drawRace($("endRace"));
}

$("againButton").addEventListener("click", () => {
  $("endDialog").close();
  startGame(game.s);
});

$("pickButton").addEventListener("click", () => {
  $("endDialog").close();
  showBoard(game.s.id);
  document.body.style.removeProperty("--accent");
  $("game").hidden = true;
  $("clock").hidden = true;
  $("progress").hidden = true;
  $("picker").hidden = false;
  renderPicker();
  window.startHeroScene && startHeroScene();
});

$("boardButton").addEventListener("click", () => $("endDialog").close());

// A game saved on the server can be resumed after a refresh
async function offerResume() {
  let gameId = null;
  try {
    gameId = localStorage.getItem(SAVED_GAME);
  } catch (e) {
    return;
  }
  if (!gameId) return;
  try {
    const res = await api("GET", GAMES_URL + "/" + encodeURIComponent(gameId));
    if (!res.ok || res.data.game.status !== "active") throw new Error("not resumable");
    const s = SCENARIOS.find((x) => x.id === res.data.game.scenarioId);
    $("resumeName").textContent = s.name + ", day " + (res.data.game.day - s.start + 1) + " of " + (s.dates.length - s.start);
    $("resumeBar").hidden = false;
    $("resumeButton").onclick = () => enterGame(res.data.game);
  } catch (e) {
    try {
      localStorage.removeItem(SAVED_GAME);
    } catch (ignored) {
      // Blocked storage
    }
  }
}

renderSpeeds($("speedPick"));
renderPicker();
offerResume();
