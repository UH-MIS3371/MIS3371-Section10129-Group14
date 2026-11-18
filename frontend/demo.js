// Transaction demo: walks one real order through every layer, one step on screen at a time.
// The controls live in a fixed bar at the bottom (Back, Next, progress), so they never move; the left and
// right arrow keys work too. Presets include invalid orders, so the demo also shows the server enforcing the rules.

const PRESETS = [
  { name: "Valid order", symbol: "NVDA", side: "Buy", qty: "1" },
  { name: "Quantity 0", symbol: "AAPL", side: "Buy", qty: "0" },
  { name: "Not enough cash", symbol: "IBM", side: "Buy", qty: "999" },
  { name: "Sell shares you don't own", symbol: "TSLA", side: "Sell", qty: "5" }
];
const LABELS = ["Browser", "API Gateway", "Lambda", "Rules", "DynamoDB", "Retrieve", "Result"];

const $ = (id) => document.getElementById(id);
let ctx = null;
let shown = [];
let view = 0;
let running = false;

function code(value) {
  return el("pre", { class: "code" }, typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

function where(text) {
  return el("p", { class: "where" }, text);
}

// say: the one sentence to say aloud; cue: what to point at on the screen
function card(number, layer, title, say, cue, ...body) {
  return el("li", { class: "demo-step" },
    el("div", { class: "demo-step-head" }, el("span", { class: "demo-num" }, String(number)), el("div", null, el("h2", null, title), el("p", { class: "muted" }, layer))),
    el("p", { class: "say" }, say),
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
  const c = JSON.parse(atob(user.token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  return { user, claims: { email: c.email, sub: c.sub, "cognito:groups": c["cognito:groups"] || [], "expires in": Math.max(0, Math.round((c.exp * 1000 - Date.now()) / 60000)) + " min" } };
}

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

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
      code("POST " + ctx.url + "\nContent-Type: application/json\nAuthorization: Bearer " + user.token.slice(0, 18) + "…"),
      el("div", { style: "height: 10px" }), code(c),
      el("p", { class: "note", style: "margin-top: 8px" }, API_BASE.startsWith("/") ? "This copy runs on your computer, so a local server stands in for API Gateway." : "This is the live API."),
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
      el("div", { class: "demo-facts" },
        el("span", null, "HTTP status ", el("strong", { class: "mono" }, String(ctx.res.status))),
        el("span", null, "Round trip ", el("strong", { class: "mono" }, ctx.res.ms + " ms")),
        el("span", null, "Inside Lambda ", el("strong", { class: "mono" }, serverMs === undefined ? "n/a" : serverMs + " ms"))),
      code(pick(ctx.res.data, ["status", "message", "reason", "persisted", "transactionId", "account"])),
      where("aws/lambda/index.js → handler() → route() → postTrade()"));
  },
  function rules() {
    return card(4, "Backend business logic", "The server checks every rule itself",
      "The browser can be bypassed, so the backend repeats every rule in order and stops at the first one that fails.",
      "the Failed row, or all Passed. Whether anything is saved depends on this table.",
      ctx.trace
        ? el("table", { class: "demo-rules" },
          el("tbody", null, ctx.trace.map((r) => el("tr", null,
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
      miss.replaceChildren(el("p", { class: "note", style: "margin-top: 10px" }, "HTTP " + r.status + " · " + r.ms + " ms"), code(r.data));
    } }, "Try a number that doesn't exist");
    return card(6, "Amazon DynamoDB · GET", "The saved record can be read back",
      "A second request reads the record from DynamoDB using only the confirmation number. This is what the Check transaction status panel does.",
      "the same transactionId and status as the last step.",
      el("div", { class: "demo-facts" }, el("span", null, "HTTP status ", el("strong", { class: "mono" }, String(got.status))), el("span", null, "Round trip ", el("strong", { class: "mono" }, got.ms + " ms"))),
      code(pick(got.data.trade || {}, ["transactionId", "status", "tradeType", "stockSymbol", "shareQuantity", "executionPrice", "transactionValue", "submittedAt", "completedAt", "rejectionReason"])),
      button, miss,
      where("aws/lambda/index.js → getTrade() · frontend/activity.js → lookupTransaction()"));
  },
  function response() {
    const d = ctx.res.data;
    const ok = d.status === "ACCEPTED";
    return card(7, "Browser", "The page shows the result",
      ok ? "The page shows the confirmation number only after DynamoDB confirmed the save." : "The page shows the rejection and its reason, and the order is recorded as Rejected.",
      "the confirmation number, or the reason for the rejection.",
      el("div", { class: "demo-result " + (ok ? "ok" : "bad") },
        el("p", null, statusPill(ok ? "Accepted" : "Rejected"), "  ", el("strong", null, ok ? "Order accepted" : "Order rejected")),
        d.transactionId ? el("p", { class: "mono", style: "margin-top: 6px; overflow-wrap: anywhere" }, "Confirmation number " + d.transactionId) : null,
        !ok ? el("p", { style: "margin-top: 6px" }, d.reason) : null),
      el("div", { class: "button-row", style: "margin-top: 14px" },
        d.transactionId ? el("a", { class: "btn sm", href: "result.html?id=" + encodeURIComponent(d.transactionId) }, "Open receipt") : null,
        d.transactionId ? el("a", { class: "btn sm", href: "activity.html#status" }, "Check status") : null,
        el("a", { class: "btn sm", href: "activity.html" }, "View activity")),
      where("frontend/result.js → renderReceipt()"));
  }
];

function paint() {
  const started = shown.length > 0;
  const last = shown.length >= STEPS.length;
  $("setup").hidden = started;
  $("demoHead").hidden = started;
  $("pipeline").hidden = !started;
  $("orderLine").hidden = !started;
  $("pipeline").querySelectorAll("button").forEach((b, i) => {
    b.classList.toggle("done", i < shown.length);
    b.setAttribute("aria-current", i === view && started ? "step" : "false");
    b.disabled = i >= shown.length;
  });
  if (started) $("steps").replaceChildren(shown[view]);
  else $("steps").replaceChildren();
  $("demoBack").disabled = !started || view === 0;
  $("demoNext").textContent = !started ? "Start demo" : view < shown.length - 1 ? "Next step" : last ? "Run again" : "Next step";
  $("demoReset").hidden = !started;
  $("demoProgress").textContent = started ? "Step " + (view + 1) + " of " + STEPS.length : "";
}

async function next() {
  if (running) return;
  if (shown.length && view < shown.length - 1) {
    view++;
    paint();
    return;
  }
  if (shown.length >= STEPS.length) return reset(true);
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
  if (view > 0 && !running) {
    view--;
    paint();
  }
}

function reset(startAgain) {
  shown = [];
  view = 0;
  ctx = null;
  paint();
  if (startAgain === true) next();
}

function usePreset(p) {
  $("demoSymbol").value = p.symbol;
  $("demoSide").value = p.side;
  $("demoQty").value = p.qty;
  $("presets").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === p.name)));
}

$("demoSymbol").replaceChildren(...Object.keys(STOCKS).map((s) => el("option", { value: s }, s + " · " + STOCKS[s].name)));
$("presets").replaceChildren(...PRESETS.map((p) => el("button", { type: "button", onclick: () => usePreset(p) }, p.name)));
$("pipeline").replaceChildren(...LABELS.map((label, i) => el("button", { type: "button", onclick: () => { if (i < shown.length) { view = i; paint(); } } }, el("span", { class: "n" }, String(i + 1)), label)));
usePreset(PRESETS[0]);
$("demoNext").addEventListener("click", next);
$("demoBack").addEventListener("click", back);
$("demoReset").addEventListener("click", () => reset());
document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "ArrowRight") { e.preventDefault(); next(); }
  if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
});
paint();
