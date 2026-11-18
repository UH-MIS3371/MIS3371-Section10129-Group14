// Transaction demo: walks one real order through every layer and shows the live data at each step.
// Presets include invalid orders, so the demo also shows the server enforcing the rules on its own.

const PRESETS = [
  { name: "Valid order", symbol: "NVDA", side: "Buy", qty: "1" },
  { name: "Quantity 0", symbol: "AAPL", side: "Buy", qty: "0" },
  { name: "Not enough cash", symbol: "IBM", side: "Buy", qty: "999" },
  { name: "Sell shares you don't own", symbol: "TSLA", side: "Sell", qty: "5" }
];

const $ = (id) => document.getElementById(id);
let ctx = null;
let next = 0;
let running = false;

function code(value) {
  return el("pre", { class: "code" }, typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

function where(text) {
  return el("p", { class: "where" }, text);
}

function card(number, layer, title, text, ...body) {
  return el("li", { class: "demo-step" },
    el("div", { class: "demo-step-head" }, el("span", { class: "demo-num" }, String(number)), el("div", null, el("h2", null, title), el("p", { class: "muted" }, layer))),
    el("p", null, text), body);
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

const STEPS = [
  function browser() {
    const symbol = $("demoSymbol").value;
    const qty = $("demoQty").value.trim();
    const whole = /^\d+$/.test(qty) && Number(qty) >= 1;
    ctx.body = { symbol, tradeType: $("demoSide").value, quantity: Number(qty), orderType: "Market", requestId: crypto.randomUUID(), trace: true };
    return card(1, "Browser · HTML, CSS and JavaScript", "The form becomes JSON",
      "JavaScript reads the form, checks the quantity for quick feedback, and builds the JSON request. " + (whole
        ? "The browser's check passes."
        : "The browser's check would stop this order (the quantity must be a whole number of 1 or more). The demo sends it anyway, to show the server checks again."),
      code(ctx.body),
      el("p", { class: "note" }, "requestId lets the server ignore a retried copy of this order. trace: true only asks the server to explain its checks for this demo."),
      where("frontend/trade.js → submitOrder() and app.js → api()"));
  },
  function gateway() {
    const { user, claims: c } = claims();
    ctx.url = (API_BASE.startsWith("/") ? location.origin : "") + API_BASE + "/trades";
    return card(2, "Amazon API Gateway · HTTP API", "The request arrives at the front door",
      "API Gateway receives POST /api/trades. Its JWT authorizer verifies the Cognito token's signature and expiry before Lambda runs; a missing or invalid token is turned away with 401. "
        + (API_BASE.startsWith("/") ? "This copy is running on your computer, so a local server stands in for API Gateway." : "This is the live API."),
      code("POST " + ctx.url + "\nContent-Type: application/json\nAuthorization: Bearer " + user.token.slice(0, 18) + "…"),
      el("p", { class: "label", style: "margin-top: 12px" }, "Who the token says you are"), code(c),
      where("AWS API Gateway → authorizer CognitoLogin · aws/README.md"));
  },
  async function lambda() {
    ctx.res = await timed("POST", "/trades", ctx.body);
    clearCache();
    const { trace, serverMs, ...shown } = ctx.res.data;
    ctx.trace = trace;
    ctx.id = ctx.res.data.transactionId;
    return card(3, "AWS Lambda · Node.js", "Lambda runs the backend",
      "Lambda starts the handler, which finds the route, reads who you are from the verified token, and processes the order. The response comes back as JSON.",
      el("div", { class: "demo-facts" },
        el("span", null, "HTTP status ", el("strong", { class: "mono" }, String(ctx.res.status))),
        el("span", null, "Round trip ", el("strong", { class: "mono" }, ctx.res.ms + " ms")),
        el("span", null, "Inside Lambda ", el("strong", { class: "mono" }, serverMs === undefined ? "n/a" : serverMs + " ms"))),
      code(shown),
      where("aws/lambda/index.js → handler() → route() → postTrade()"));
  },
  function rules() {
    const rows = ctx.trace;
    return card(4, "Backend business logic", "The server checks every rule itself",
      "The browser's checks help the user, but they can be bypassed, so the backend repeats every rule in order and stops at the first failure. Whether it saves anything depends on this step.",
      rows
        ? el("table", { class: "demo-rules" },
          el("tbody", null, rows.map((r) => el("tr", null,
            el("td", { class: "mono" }, r.rule), el("td", null, r.name + (r.detail ? ": " + r.detail : "")),
            el("td", null, pill(r.status, r.status === "Passed" ? "ok" : r.status === "Failed" ? "bad" : ""))))))
        : el("p", { class: "note" }, "This server did not return a rule trace. Deploy the latest Lambda to see it."),
      where("aws/lambda/backend/trades.js → validateOrder() and checkAccount()"));
  },
  function database() {
    const d = ctx.res.data;
    const saved = d.persisted === true;
    return card(5, "Amazon DynamoDB", saved ? "The record is saved" : "Nothing was saved",
      d.status === "ACCEPTED"
        ? "One transaction writes two things together: the trade record into the Trades table, and the new cash and holdings into the Accounts table. Both are saved or neither is, and the commit re-checks cash or shares so two orders cannot spend the same money."
        : saved
          ? "A Rejected record is saved with the reason, so every order can be traced. Cash and holdings are never touched by a rejected order."
          : "The order was not processed and no record was written.",
      d.trade ? code(d.trade) : null,
      d.account ? el("p", { class: "note", style: "margin-top: 8px" }, "Account after: " + money(d.account.cashCents) + " cash, " + (Object.entries(d.account.holdings).filter(([, q]) => q > 0).map(([s, q]) => q + " " + s).join(", ") || "no holdings")) : null,
      where("aws/lambda/backend/accounts.js → commitTrade() · index.js → saveRejected()"));
  },
  async function retrieval() {
    if (!ctx.id) return card(6, "Amazon DynamoDB", "Nothing to retrieve", "This order has no confirmation number because it was not saved.", where("aws/lambda/index.js → getTrade()"));
    const got = await timed("GET", "/trades/" + encodeURIComponent(ctx.id));
    const miss = el("div");
    const button = el("button", { type: "button", class: "btn sm", style: "margin-top: 12px", onclick: async () => {
      button.disabled = true;
      const r = await timed("GET", "/trades/00000000-0000-4000-8000-000000000000");
      miss.replaceChildren(el("p", { class: "note", style: "margin-top: 10px" }, "HTTP " + r.status + " · " + r.ms + " ms"), code(r.data));
    } }, "Try a number that doesn't exist");
    return card(6, "Amazon DynamoDB · GET", "The saved record can be retrieved",
      "A second request, GET /api/trades/{confirmation number}, makes Lambda read the record back from DynamoDB by its key. This is what the Check transaction status panel does.",
      el("div", { class: "demo-facts" }, el("span", null, "HTTP status ", el("strong", { class: "mono" }, String(got.status))), el("span", null, "Round trip ", el("strong", { class: "mono" }, got.ms + " ms"))),
      code(got.data), button, miss,
      where("aws/lambda/index.js → getTrade() · frontend/activity.js → lookupTransaction()"));
  },
  function response() {
    const d = ctx.res.data;
    const ok = d.status === "ACCEPTED";
    return card(7, "Browser", "The page shows the result",
      ok ? "The page shows the confirmation number only after DynamoDB confirmed the save." : "The page shows the rejection and its reason, and the order is recorded as Rejected.",
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

function progress() {
  $("demoProgress").textContent = next === 0 ? "" : next >= STEPS.length ? "Done: all " + STEPS.length + " steps" : "Step " + next + " of " + STEPS.length;
  $("demoNext").textContent = next === 0 ? "Start demo" : next >= STEPS.length ? "Run again" : "Next step";
  $("demoReset").hidden = next === 0;
  $("demoAll").hidden = next >= STEPS.length;
}

async function runStep() {
  if (running) return false;
  if (next >= STEPS.length) {
    reset(true);
    return true;
  }
  running = true;
  if (next === 0) ctx = {};
  $("demoNext").disabled = true;
  try {
    const node = await STEPS[next]();
    $("steps").append(node);
    node.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
    next++;
    for (const id of ["demoSymbol", "demoSide", "demoQty"]) $(id).disabled = next > 0 && next < STEPS.length;
    $("presets").querySelectorAll("button").forEach((b) => (b.disabled = next > 0 && next < STEPS.length));
  } catch (e) {
    $("steps").append(el("li", { class: "demo-step" }, errorState("This step could not run. " + e.message, null)));
    running = false;
    $("demoNext").disabled = false;
    return false;
  }
  running = false;
  $("demoNext").disabled = false;
  progress();
  return true;
}

function reset(startAgain) {
  $("steps").replaceChildren();
  next = 0;
  ctx = null;
  for (const id of ["demoSymbol", "demoSide", "demoQty"]) $(id).disabled = false;
  $("presets").querySelectorAll("button").forEach((b) => (b.disabled = false));
  progress();
  if (startAgain === true) runStep();
}

function usePreset(p) {
  $("demoSymbol").value = p.symbol;
  $("demoSide").value = p.side;
  $("demoQty").value = p.qty;
  $("presets").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === p.name)));
}

$("demoSymbol").replaceChildren(...Object.keys(STOCKS).map((s) => el("option", { value: s }, s + " · " + STOCKS[s].name)));
$("presets").replaceChildren(...PRESETS.map((p) => el("button", { type: "button", onclick: () => usePreset(p) }, p.name)));
usePreset(PRESETS[0]);
$("demoNext").addEventListener("click", runStep);
$("demoReset").addEventListener("click", () => reset());
$("demoAll").addEventListener("click", async () => {
  while (next < STEPS.length) if (!(await runStep())) break;
});
progress();
