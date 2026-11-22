// Grader check: the Milestone 4 requirements, each verified live. Step 1 submits an order and shows the confirmation
// number, step 2 reads the saved record back with it, step 3 (demo-matrix.js) runs the test matrix, step 4 says where
// it all runs. The checklist at the top turns green as each requirement is met. The audience walkthrough is demo.js.

const $ = (id) => document.getElementById(id);

const EXAMPLES = [
  { name: "Valid order", symbol: "NVDA", side: "Buy", qty: "1" },
  { name: "Quantity 0", symbol: "AAPL", side: "Buy", qty: "0" },
  { name: "Fraction 1.5", symbol: "AAPL", side: "Buy", qty: "1.5" },
  { name: "Too expensive", symbol: "IBM", side: "Buy", qty: "999" },
  { name: "Sell more than owned", symbol: "TSLA", side: "Sell", qty: "5" }
];

const REQUIREMENTS = [
  "A transaction is submitted and a confirmation number comes back",
  "The saved transaction is retrieved with that number",
  "Valid, invalid, boundary and business-rule cases are tested",
  "The page talks to the backend and the database"
];
const state = REQUIREMENTS.map(() => ({ kind: "", text: "Not yet" }));
let backendProved = false;

function paintChecklist() {
  $("gCheck").replaceChildren(...REQUIREMENTS.map((text, i) => el("li", { class: "g-item " + state[i].kind },
    el("span", { class: "g-mark", "aria-hidden": "true" }, state[i].kind === "ok" ? "✓" : state[i].kind === "bad" ? "✕" : String(i + 1)),
    el("span", { class: "g-text" }, text, state[i].detail ? el("small", { class: "muted" }, state[i].detail) : null),
    pill(state[i].text, state[i].kind))));
}
function mark(i, kind, text, detail) {
  state[i] = { kind, text, detail };
  paintChecklist();
}

async function timed(method, path, body) {
  const t0 = performance.now();
  const res = await authFetch(API_BASE + path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ms: Math.round(performance.now() - t0), data };
}

const httpPill = (n) => pill("HTTP " + n, n >= 200 && n < 300 ? "ok" : "bad");

function backendCheck() {
  const guest = signedInUser().isGuest;
  if (guest) return mark(3, "warn", "Guest", "Guest mode runs in your browser and sends nothing to AWS. Sign in to prove the backend.");
  backendProved = true;
  const where = API_BASE.startsWith("/") ? "a local server on this computer" : API_BASE.replace(/^https:\/\//, "").replace(/\/api$/, "");
  mark(3, "ok", "Done", "Real responses from " + where);
}

// ---------- step 1 ----------

function copyButton(text) {
  const button = el("button", { type: "button", class: "btn sm", onclick: async () => {
    try { await navigator.clipboard.writeText(text); button.textContent = "Copied"; } catch (e) { button.textContent = "Select the number and copy it"; }
  } }, "Copy number");
  return button;
}

async function submitOrder(e) {
  e.preventDefault();
  const button = $("gSubmit");
  button.disabled = true;
  $("gResult").replaceChildren(el("p", { class: "muted" }, "Sending…"));
  const raw = $("gQty").value.trim();
  const body = { symbol: $("gSymbol").value, tradeType: $("gSide").value, quantity: raw === "" ? null : Number(raw), orderType: "Market", requestId: crypto.randomUUID() };
  try {
    const r = await timed("POST", "/trades", body);
    clearCache();
    const d = r.data;
    const ok = d.status === "ACCEPTED";
    $("gResult").replaceChildren(el("div", { class: "g-result " + (ok ? "ok" : "bad") },
      el("div", { class: "g-line" }, statusPill(ok ? "Accepted" : "Rejected"), httpPill(r.status), el("span", { class: "muted mono" }, r.ms + " ms")),
      el("p", null, el("strong", null, ok ? "Order accepted." : "Order rejected."), " ", ok ? (d.message || "") : (d.reason || "The server refused this order.")),
      d.transactionId ? el("div", null, el("small", { class: "muted" }, "Confirmation number"), el("p", { class: "g-id mono" }, d.transactionId)) : null,
      d.transactionId ? el("div", { class: "button-row" }, copyButton(d.transactionId)) : null,
      el("p", { class: "muted" }, d.persisted ? "Saved in DynamoDB as a " + (ok ? "completed trade" : "Rejected record") + ". " : "Not saved. ",
        d.account ? "Cash after: " + money(d.account.cashCents) + "." : "")));
    if (d.transactionId) {
      $("gId").value = d.transactionId;
      if (ok) mark(0, "ok", "Done", "Confirmation number " + d.transactionId);
    } else if (!ok && state[0].kind !== "ok") {
      mark(0, "", "Not yet", "That order was rejected. Try the Valid order example.");
    }
    backendCheck();
  } catch (err) {
    $("gResult").replaceChildren(errorState("The order could not be sent. " + err.message, null));
  }
  button.disabled = false;
}

// ---------- step 2 ----------

const FIELDS = [["transactionId", "Confirmation number"], ["status", "Status"], ["tradeType", "Buy or sell"], ["stockSymbol", "Stock"], ["shareQuantity", "Shares"], ["executionPrice", "Price"], ["transactionValue", "Total"], ["submittedAt", "Submitted"], ["completedAt", "Completed"], ["rejectionReason", "Rejection reason"]];

async function retrieve(id, expectMiss) {
  const clean = id.trim();
  if (!clean) return ($("gFound").replaceChildren(el("p", { class: "error" }, "Enter a confirmation number, or submit an order in step 1 first.")));
  $("gFound").replaceChildren(el("p", { class: "muted" }, "Reading from the database…"));
  try {
    const r = await timed("GET", "/trades/" + encodeURIComponent(clean));
    const t = r.data.trade;
    $("gFound").replaceChildren(el("div", { class: "g-result " + (r.status === 200 ? "ok" : "bad") },
      el("div", { class: "g-line" }, httpPill(r.status), el("span", { class: "muted mono" }, r.ms + " ms")),
      t ? el("dl", { class: "g-facts" }, FIELDS.filter(([k]) => t[k] !== undefined && t[k] !== null).flatMap(([k, label]) => [el("dt", null, label), el("dd", { class: "mono" }, String(t[k]))]))
        : el("p", null, el("strong", null, r.data.reason || "Not found."), expectMiss ? " That is the correct answer for a number that was never issued." : "")));
    if (t && !expectMiss) mark(1, "ok", "Done", "Read back " + t.status + " " + t.tradeType + " " + t.shareQuantity + " " + t.stockSymbol);
    backendCheck();
  } catch (err) {
    $("gFound").replaceChildren(errorState("The lookup failed. " + err.message, null));
  }
}

// ---------- step 4 ----------

function facts() {
  const user = signedInUser();
  const rows = [
    ["Website", location.origin + " (hosted on AWS Amplify)"],
    ["API", (API_BASE.startsWith("/") ? location.origin + API_BASE : API_BASE) + (API_BASE.startsWith("/") ? " (a local server stands in for API Gateway)" : " (Amazon API Gateway, HTTP API)")],
    ["Sign-in", user.isGuest ? "Guest: no token, nothing sent to AWS" : "Amazon Cognito. Every request carries the ID token and API Gateway checks it before Lambda runs."],
    ["Business rules", "AWS Lambda (Node.js): aws/lambda/backend/trades.js"],
    ["Database", "Amazon DynamoDB: MarketStreetTrades holds one record per order, Accepted or Rejected"],
    ["See it yourself", "Open the browser's developer tools, Network tab, and watch the requests above go to the API address."]
  ];
  $("gFacts").replaceChildren(...rows.flatMap(([k, v]) => [el("dt", null, k), el("dd", null, v)]));
}

// ---------- start ----------

$("gSymbol").replaceChildren(...Object.keys(STOCKS).map((s) => el("option", { value: s }, s + " · " + STOCKS[s].name)));
$("gQuick").replaceChildren(...EXAMPLES.map((x) => el("button", { type: "button", class: "btn sm", onclick: () => {
  $("gSymbol").value = x.symbol;
  $("gSide").value = x.side;
  $("gQty").value = x.qty;
  $("gForm").requestSubmit();
} }, x.name)));
$("gForm").addEventListener("submit", submitOrder);
$("gLookup").addEventListener("submit", (e) => { e.preventDefault(); retrieve($("gId").value, false); });
$("gMissing").addEventListener("click", () => retrieve("00000000-0000-4000-8000-000000000000", true));
document.addEventListener("matrix-finished", (e) => {
  const { pass, fail, na, total } = e.detail;
  mark(2, fail ? "bad" : "ok", fail ? "Failed" : "Done", pass + " of " + total + " cases passed" + (fail ? ", " + fail + " failed" : "") + (na ? ", " + na + " not run" : ""));
  backendCheck();
});
facts();
paintChecklist();
