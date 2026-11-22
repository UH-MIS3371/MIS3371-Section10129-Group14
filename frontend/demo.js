// Transaction demo: walks one real order through every layer, one step on screen at a time.
// The controls live in a fixed bar at the bottom (Back, Next, progress), so they never move; the left and
// right arrow keys work too. Presets include invalid orders, so the demo also shows the server enforcing the rules.
// For the audience: a journey track with a moving packet, a "will it be accepted?" guess with a running score,
// rules that appear one at a time, and a quick way to try another order when one run ends.

const PRESETS = [
  { name: "Valid order", symbol: "NVDA", side: "Buy", qty: "1" },
  { name: "Quantity 0", symbol: "AAPL", side: "Buy", qty: "0" },
  { name: "Not enough cash", symbol: "IBM", side: "Buy", qty: "999" },
  { name: "Sell shares you don't own", symbol: "TSLA", side: "Sell", qty: "5" }
];
const LABELS = ["Browser", "API Gateway", "Lambda", "Rules", "DynamoDB", "Retrieve", "Result"];
const GUESS_AT = 2; // the guess is asked just before step 3, where Lambda decides

const $ = (id) => document.getElementById(id);
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let ctx = null;
let shown = [];
let view = 0;
let running = false;
let awaiting = false; // showing the "ask the audience" card instead of a step
let activePreset = PRESETS[0];
const score = { right: 0, total: 0 };
const presetButtons = [];

const presetLabel = (p) => p.side + " " + p.qty + " " + p.symbol;

// Only the values that say good or bad get a colour (green or red); the rest of the code stays plain, so the eye
// goes straight to what matters: the outcome, whether it was saved, and the reason for a refusal
const MARKS = /("(?:status|persisted|success|reason|rejectionReason)":\s*)("(?:[^"\\]|\\.)*"|true|false)/g;

function verdictOf(key, value) {
  const v = value.replace(/^"|"$/g, "");
  if (key === "reason" || key === "rejectionReason") return "bad";
  if (key === "persisted" || key === "success") return v === "true" ? "ok" : "bad";
  if (/^(ACCEPTED|Accepted|FOUND)$/.test(v)) return "ok";
  return /^(REJECTED|Rejected|ERROR)$/.test(v) ? "bad" : null;
}

function marked(text) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(MARKS)) {
    const kind = verdictOf(m[1].match(/"(\w+)"/)[1], m[2]);
    parts.push(text.slice(last, m.index + m[1].length), kind ? el("span", { class: "hl " + kind }, m[2]) : m[2]);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

function code(value) {
  return el("pre", { class: "code" }, marked(typeof value === "string" ? value : JSON.stringify(value, null, 2)));
}

// An HTTP status: 2xx is green, anything else is red
const httpStatus = (n) => el("strong", { class: "mono hl " + (n >= 200 && n < 300 ? "ok" : "bad") }, String(n));

const legend = () => el("p", { class: "hl-key" }, el("span", { class: "hl ok" }, "Green"), " is good   ", el("span", { class: "hl bad" }, "Red"), " is a problem");

function where(text) {
  return el("p", { class: "where" }, text);
}

// say: the one sentence to say aloud; cue: what to point at on the screen
function card(number, layer, title, say, cue, ...body) {
  return el("li", { class: "demo-step" },
    el("div", { class: "demo-step-head" }, el("span", { class: "demo-num" }, String(number)), el("div", null, el("h2", null, title), el("p", { class: "muted" }, layer))),
    el("p", { class: "say" }, el("span", { class: "tag" }, "Say"), say),
    cue ? el("p", { class: "cue" }, el("b", null, "Point at "), cue) : null,
    body);
}

async function timed(method, path, body) {
  const t0 = performance.now();
  const res = await authFetch(API_BASE + path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ms: Math.round(performance.now() - t0), data };
}

function claims() {
  const user = signedInUser();
  if (user.isGuest) return { user, claims: { email: "guest (no sign-in token)", "cognito:groups": [], note: "Guest mode runs in your browser. Nothing is sent to AWS." } };
  const c = JSON.parse(atob(user.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  return { user, claims: { email: c.email, sub: c.sub, "cognito:groups": c["cognito:groups"] || [], "expires in": Math.max(0, Math.round((c.exp * 1000 - Date.now()) / 60000)) + " min" } };
}

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

// ======================= AUDIENCE EXTRAS =======================

// The guess card: asked before Lambda runs, so the room commits to an answer first
function guessCard() {
  const choose = (g) => () => { ctx.guess = g; awaiting = false; next(); };
  return el("li", { class: "demo-step guess-card" },
    el("p", { class: "tag-line" }, "Ask the audience"),
    el("h2", null, "Will the server accept this order?"),
    el("p", { class: "guess-order mono" }, $("orderLine").textContent),
    el("div", { class: "guess-buttons" },
      el("button", { type: "button", class: "btn", onclick: choose("ACCEPTED") }, "Accept"),
      el("button", { type: "button", class: "btn", onclick: choose("REJECTED") }, "Reject")),
    el("p", { class: "muted" }, "Take a show of hands, click the majority answer, then watch the real request run. Skip guess moves on without one."));
}

// Scores the guess against the real answer and returns the banner for the Lambda step
function verdict() {
  const got = ctx.res.data.status;
  if (!ctx.guess || (got !== "ACCEPTED" && got !== "REJECTED")) return null;
  const right = got === ctx.guess;
  score.total++;
  if (right) score.right++;
  return el("p", { class: "guess-verdict " + (right ? "ok" : "bad") },
    (right ? "The audience called it. " : "Not what the audience expected. ") + "The server " + (got === "ACCEPTED" ? "accepted" : "rejected") + " the order.");
}

function confetti(box) {
  if (reduceMotion) return;
  const colors = ["#44a282", "#4a8ad6", "#d9a441", "#ffffff", "#e5566f"];
  for (let i = 0; i < 44; i++) {
    const bit = el("span", { class: "confetti", "aria-hidden": "true", style:
      "--x:" + Math.round((Math.random() - 0.5) * 420) + "px;--y:" + (130 + Math.round(Math.random() * 130)) + "px;--r:" +
      Math.round(Math.random() * 720 - 360) + "deg;--c:" + colors[i % colors.length] + ";--d:" + Math.round(Math.random() * 260) + "ms" });
    box.append(bit);
    setTimeout(() => bit.remove(), 1900);
  }
}

// One bar: how much of the round trip was Lambda and how much was the network and API Gateway
function timeBar() {
  const server = ctx.res.data.serverMs;
  if (typeof server !== "number") return null;
  const total = ctx.res.ms;
  const net = Math.max(1, total - server);
  return el("div", { class: "time" },
    el("p", { class: "muted" }, "Where the " + total + " ms went"),
    el("div", { class: "time-bar", role: "img", "aria-label": "Network and API Gateway " + net + " milliseconds, Lambda " + server + " milliseconds" },
      el("span", { class: "seg net", style: "flex: " + net }), el("span", { class: "seg srv", style: "flex: " + Math.max(1, server) })),
    el("p", { class: "time-key" }, el("span", { class: "k net" }), "Network and API Gateway " + net + " ms", el("span", { class: "k srv" }), "Lambda " + server + " ms"));
}

function copyButton(text) {
  const button = el("button", { type: "button", class: "btn sm", onclick: async () => {
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied";
    } catch (e) {
      button.textContent = "Select and copy it above";
    }
  } }, "Copy number");
  return button;
}

function runPreset(p) {
  reset();
  usePreset(p);
  next();
}

function another() {
  const others = PRESETS.filter((p) => p !== activePreset);
  return el("div", { class: "again" },
    el("p", { class: "muted" }, "Try another order"),
    el("div", { class: "button-row" },
      others.map((p) => el("button", { type: "button", class: "btn sm", onclick: () => runPreset(p) }, p.name)),
      el("button", { type: "button", class: "btn sm", onclick: () => runPreset(PRESETS[Math.floor(Math.random() * PRESETS.length)]) }, "Surprise me")));
}

// ======================= THE SEVEN STEPS =======================

const STEPS = [
  function browser() {
    const symbol = $("demoSymbol").value;
    const qty = $("demoQty").value.trim();
    const whole = /^\d+$/.test(qty) && Number(qty) >= 1;
    ctx.body = { symbol, tradeType: $("demoSide").value, quantity: Number(qty), orderType: "Market", requestId: crypto.randomUUID(), trace: true };
    return card(1, "Browser · HTML, CSS and JavaScript", "The form becomes JSON",
      "JavaScript reads the form, checks it for quick feedback, and builds the JSON request.",
      "the JSON body, and the requestId that stops a retry from trading twice.",
      el("p", { class: whole ? "note" : "error", style: "margin-bottom: 10px" }, whole
        ? "The browser's own check passes."
        : "The browser would stop this order: shares must be a whole number of 1 or more. The demo sends it anyway, to prove the server checks again."),
      code(ctx.body),
      where("frontend/trade.js → submitOrder() · app.js → api()"));
  },
  function gateway() {
    const { user, claims: c } = claims();
    ctx.url = (API_BASE.startsWith("/") ? location.origin : "") + API_BASE + "/trades";
    return card(2, "Amazon API Gateway · HTTP API", "The request reaches the front door",
      "API Gateway checks your sign-in token before any of our code runs. No valid token means a 401 and Lambda never starts.",
      "the Authorization header, and who the token says you are.",
      code("POST " + ctx.url + "\nContent-Type: application/json\nAuthorization: " + (user.token ? "Bearer " + user.token.slice(0, 18) + "…" : "(none: guest mode)")),
      el("div", { style: "height: 10px" }), code(c),
      el("p", { class: "note", style: "margin-top: 8px" }, user.isGuest ? "Guest mode: this request is answered inside your browser, so nothing is sent to AWS."
        : API_BASE.startsWith("/") ? "This copy runs on your computer, so a local server stands in for API Gateway." : "This is the live API."),
      where("API Gateway → authorizer CognitoLogin · aws/README.md"));
  },
  async function lambda() {
    ctx.res = await timed("POST", "/trades", ctx.body);
    clearCache();
    const { trace, serverMs } = ctx.res.data;
    ctx.trace = trace;
    ctx.id = ctx.res.data.transactionId;
    return card(3, "AWS Lambda · Node.js", "Lambda runs our backend",
      "Lambda finds the route, reads who you are from the verified token, processes the order and answers with JSON.",
      "the HTTP status and how long it took.",
      verdict(),
      el("div", { class: "demo-facts" },
        el("span", null, "HTTP status ", httpStatus(ctx.res.status)),
        el("span", null, "Round trip ", el("strong", { class: "mono" }, ctx.res.ms + " ms")),
        el("span", null, "Inside Lambda ", el("strong", { class: "mono" }, serverMs === undefined ? "n/a" : serverMs + " ms"))),
      legend(),
      signedInUser().isGuest ? el("p", { class: "note", style: "margin-bottom: 10px" }, "Guest mode: the same rules run in your browser instead of Lambda, so nothing is saved on the server.") : null,
      code(pick(ctx.res.data, ["status", "message", "reason", "persisted", "transactionId", "account"])),
      where("aws/lambda/index.js → handler() → route() → postTrade()"));
  },
  function rules() {
    return card(4, "Backend business logic", "The server checks every rule itself",
      "The browser can be bypassed, so the backend repeats every rule in order and stops at the first one that fails.",
      "the Failed row, or all Passed. Whether anything is saved depends on this table.",
      ctx.trace
        ? el("table", { class: "demo-rules" },
          el("tbody", null, ctx.trace.map((r, i) => el("tr", { class: r.status === "Failed" ? "fail" : r.status === "Passed" ? "pass" : "skip", style: "--i:" + i },
            el("td", { class: "mono" }, r.rule), el("td", null, r.name + (r.detail ? ": " + r.detail : "")),
            el("td", null, pill(r.status, r.status === "Passed" ? "ok" : r.status === "Failed" ? "bad" : ""))))))
        : el("p", { class: "note" }, "This server did not return a rule trace. Deploy the latest Lambda to see it."),
      where("aws/lambda/backend/trades.js → validateOrder() · checkAccount()"));
  },
  function database() {
    const d = ctx.res.data;
    const saved = d.persisted === true;
    return card(5, "Amazon DynamoDB", saved ? "The record is saved" : "Nothing was saved",
      d.status === "ACCEPTED"
        ? "One transaction saves the trade and the new cash and holdings together. Both happen or neither does, and cash is re-checked inside it."
        : saved
          ? "A Rejected record is saved with the reason, so every order can be traced. Cash and holdings are never touched."
          : "The order was not processed and nothing was written.",
      d.trade ? "status, completedAt, and the confirmation number (transactionId)." : null,
      d.trade ? code(d.trade) : null,
      d.account ? el("p", { class: "note", style: "margin-top: 8px" }, "Account after: " + money(d.account.cashCents) + " cash, " + (Object.entries(d.account.holdings).filter(([, q]) => q > 0).map(([s, q]) => q + " " + s).join(", ") || "no holdings")) : null,
      where("aws/lambda/backend/accounts.js → commitTrade() · index.js → saveRejected()"));
  },
  async function retrieval() {
    if (!ctx.id) return card(6, "Amazon DynamoDB", "Nothing to retrieve", "This order has no confirmation number because it was not saved.", null, where("aws/lambda/index.js → getTrade()"));
    const got = await timed("GET", "/trades/" + encodeURIComponent(ctx.id));
    const miss = el("div");
    const button = el("button", { type: "button", class: "btn sm", style: "margin-top: 12px", onclick: async () => {
      button.disabled = true;
      const r = await timed("GET", "/trades/00000000-0000-4000-8000-000000000000");
      miss.replaceChildren(el("p", { class: "note", style: "margin-top: 10px" }, "HTTP ", httpStatus(r.status), " · " + r.ms + " ms"), code(r.data));
    } }, "Try a number that doesn't exist");
    return card(6, "Amazon DynamoDB · GET", "The saved record can be read back",
      "A second request reads the record from DynamoDB using only the confirmation number. This is what the Check transaction status panel does.",
      "the same transactionId and status as the last step.",
      el("div", { class: "demo-facts" }, el("span", null, "HTTP status ", httpStatus(got.status)), el("span", null, "Round trip ", el("strong", { class: "mono" }, got.ms + " ms"))),
      code(pick(got.data.trade || {}, ["transactionId", "status", "tradeType", "stockSymbol", "shareQuantity", "executionPrice", "transactionValue", "submittedAt", "completedAt", "rejectionReason"])),
      button, miss,
      where("aws/lambda/index.js → getTrade() · frontend/activity.js → lookupTransaction()"));
  },
  function response() {
    const d = ctx.res.data;
    const ok = d.status === "ACCEPTED";
    const result = el("div", { class: "demo-result " + (ok ? "ok" : "bad") },
      el("p", null, statusPill(ok ? "Accepted" : "Rejected"), "  ", el("strong", null, ok ? "Order accepted" : "Order rejected")),
      d.transactionId ? el("p", { class: "mono", style: "margin-top: 6px; overflow-wrap: anywhere" }, "Confirmation number " + d.transactionId) : null,
      !ok ? el("p", { style: "margin-top: 6px" }, d.reason) : null);
    if (ok) setTimeout(() => confetti(result), 250);
    return card(7, "Browser", "The page shows the result",
      ok ? "The page shows the confirmation number only after DynamoDB confirmed the save." : "The page shows the rejection and its reason, and the order is recorded as Rejected.",
      "the confirmation number, or the reason for the rejection.",
      result,
      timeBar(),
      el("div", { class: "button-row", style: "margin-top: 14px" },
        d.transactionId ? copyButton(d.transactionId) : null,
        d.transactionId ? el("a", { class: "btn sm", href: "result.html?id=" + encodeURIComponent(d.transactionId) }, "Open receipt") : null,
        d.transactionId ? el("a", { class: "btn sm", href: "activity.html#status" }, "Check status") : null,
        el("a", { class: "btn sm", href: "activity.html" }, "View activity")),
      another(),
      where("frontend/result.js → renderReceipt()"));
  }
];

// A node is red where this order went wrong: refused by the rules, not saved, or nothing to read back
function failedAt(i) {
  const d = ctx && ctx.res && ctx.res.data;
  if (!d || i >= shown.length) return false;
  if (i === 3 || i === 6) return d.status !== "ACCEPTED";
  if (i === 4) return d.persisted !== true;
  if (i === 5) return !ctx.id;
  return false;
}

function paint() {
  const started = shown.length > 0;
  const last = shown.length >= STEPS.length;
  const current = awaiting ? shown.length : view;
  const nav = $("pipeline");
  $("setup").hidden = started;
  document.querySelector(".demo-switch").hidden = started;
  $("demoHead").hidden = started;
  nav.hidden = !started;
  $("orderLine").hidden = !started;
  nav.style.setProperty("--p", String(current / (STEPS.length - 1)));
  nav.classList.toggle("failing", failedAt(current));
  nav.querySelectorAll(".node").forEach((b, i) => {
    b.classList.toggle("done", i < shown.length);
    b.classList.toggle("now", started && i === current);
    b.classList.toggle("bad", failedAt(i));
    b.setAttribute("aria-current", i === current && started ? "step" : "false");
    b.disabled = i >= shown.length;
  });
  if (started) $("steps").replaceChildren(awaiting ? guessCard() : shown[view]);
  else $("steps").replaceChildren();
  $("demoBack").disabled = !started || (view === 0 && !awaiting);
  $("demoNext").textContent = !started ? "Start demo" : awaiting ? "Skip guess" : view < shown.length - 1 ? "Next step" : last ? "Run again" : "Next step";
  $("demoReset").hidden = !started;
  $("demoProgress").textContent = started ? "Step " + (current + 1) + " of " + STEPS.length : "";
  $("demoScore").hidden = score.total === 0;
  $("demoScore").textContent = "Audience " + score.right + " of " + score.total + " right";
}

async function next() {
  if (running) return;
  if (shown.length && view < shown.length - 1) {
    view++;
    paint();
    return;
  }
  if (shown.length >= STEPS.length) return reset(true);
  if (shown.length === GUESS_AT && ctx.guess === undefined) {
    if (!awaiting) {
      awaiting = true;
      paint();
      window.scrollTo(0, 0);
      return;
    }
    ctx.guess = null; // Skip guess
    awaiting = false;
  }
  running = true;
  $("demoNext").disabled = true;
  if (!shown.length) {
    ctx = {};
    $("orderLine").textContent = $("demoSymbol").value + " · " + $("demoSide").value + " · " + $("demoQty").value.trim() + " share" + ($("demoQty").value.trim() === "1" ? "" : "s");
  }
  try {
    shown.push(await STEPS[shown.length]());
    view = shown.length - 1;
    paint();
    window.scrollTo(0, 0);
  } catch (e) {
    $("steps").replaceChildren(el("li", { class: "demo-step" }, errorState("This step could not run. " + e.message, null)));
  }
  running = false;
  $("demoNext").disabled = false;
  $("demoNext").focus();
}

function back() {
  if (running) return;
  if (awaiting) {
    awaiting = false;
    paint();
  } else if (view > 0) {
    view--;
    paint();
  }
}

function reset(startAgain) {
  shown = [];
  view = 0;
  ctx = null;
  awaiting = false;
  paint();
  if (startAgain === true) next();
}

function usePreset(p) {
  activePreset = p;
  $("demoSymbol").value = p.symbol;
  $("demoSide").value = p.side;
  $("demoQty").value = p.qty;
  presetButtons.forEach((b, i) => b.setAttribute("aria-pressed", String(PRESETS[i] === p)));
}

// Cycles through the examples for a moment, then lands on one at random
function surprise() {
  const button = $("surprise");
  const landing = PRESETS[Math.floor(Math.random() * PRESETS.length)];
  if (reduceMotion) return usePreset(landing);
  button.disabled = true;
  let n = 0;
  const timer = setInterval(() => {
    usePreset(PRESETS[n++ % PRESETS.length]);
    if (n <= 11) return;
    clearInterval(timer);
    usePreset(landing);
    $("presets").classList.add("landed");
    setTimeout(() => $("presets").classList.remove("landed"), 700);
    button.disabled = false;
  }, 90);
}

$("demoSymbol").replaceChildren(...Object.keys(STOCKS).map((s) => el("option", { value: s }, s + " · " + STOCKS[s].name)));
PRESETS.forEach((p) => presetButtons.push(el("button", { type: "button", onclick: () => usePreset(p) },
  el("span", { class: "p-name" }, p.name), el("span", { class: "p-order" }, presetLabel(p)))));
$("presets").replaceChildren(...presetButtons);
$("pipeline").replaceChildren(
  el("span", { class: "track" }, el("span", { class: "fill" })),
  el("span", { class: "packet", "aria-hidden": "true" }),
  ...LABELS.map((label, i) => el("button", { type: "button", class: "node", onclick: () => { if (i < shown.length) { awaiting = false; view = i; paint(); } } },
    el("span", { class: "dot" }, String(i + 1)), el("span", { class: "lbl" }, label))));
usePreset(PRESETS[0]);
$("demoNext").addEventListener("click", next);
$("demoBack").addEventListener("click", back);
$("demoReset").addEventListener("click", () => reset());
$("surprise").addEventListener("click", surprise);
document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "ArrowRight") { e.preventDefault(); next(); }
  if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
});
paint();
