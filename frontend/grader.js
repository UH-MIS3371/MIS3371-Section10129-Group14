// Grader check: the Milestone 4 requirements, verified live. Step 1 submits an order and shows the confirmation
// number, step 2 reads the saved record back with it, step 3 (demo-matrix.js) runs the test matrix. The progress strip
// at the top is the table of contents and ticks as each requirement is met. The audience walkthrough is demo.js.

const $ = (id) => document.getElementById(id);

const EXAMPLES = [
  { name: "Valid order", symbol: "NVDA", side: "Buy", qty: "1" },
  { name: "Quantity 0", symbol: "AAPL", side: "Buy", qty: "0" },
  { name: "Fraction 1.5", symbol: "AAPL", side: "Buy", qty: "1.5" },
  { name: "Too expensive", symbol: "IBM", side: "Buy", qty: "999" },
  { name: "Sell more than owned", symbol: "TSLA", side: "Sell", qty: "5" }
];

const STEPS = [
  { label: "Submit an order", href: "#g1", todo: "A confirmation number comes back" },
  { label: "Retrieve it by number", href: "#g2", todo: "The saved record is read back" },
  { label: "Run the test matrix", href: "#g3", todo: "Valid, invalid, boundary and rule cases" },
  { label: "Backend and database", href: "#g4", todo: "Real responses from the API" }
];
const state = STEPS.map(() => ({ kind: "", text: "To do" }));
let lastOrder = null; // what step 1 sent and got back, so step 2 can compare

function nextStep() {
  return state.slice(0, 3).findIndex((s) => s.kind !== "ok");
}

function paint() {
  const next = nextStep();
  $("gCheck").replaceChildren(...STEPS.map((step, i) => {
    const s = state[i];
    const isNext = i === next && s.kind === "";
    const mk = s.kind === "ok" ? "✓" : s.kind === "bad" ? "✕" : s.kind === "warn" ? "!" : String(i + 1);
    return el("li", { class: "g-item " + s.kind + (isNext ? " next" : "") },
      el("a", { href: step.href },
        el("span", { class: "g-mark", "aria-hidden": "true" }, mk),
        el("span", { class: "g-text" }, el("b", null, step.label), el("small", null, s.detail || step.todo)),
        pill(isNext ? "Next" : s.text, isNext ? "info" : s.kind)));
  }));
  ["s1", "s2", "matrix"].forEach((id, i) => $(id).classList.toggle("is-next", i === next));
  const hasId = $("gId").value.trim() !== "";
  $("s2").classList.toggle("is-waiting", !hasId);
  $("gRetrieve").classList.toggle("primary", hasId);
  $("gSubmit").classList.toggle("primary", state[0].kind !== "ok" || !hasId);
  $("gLead2").textContent = hasId ? "Read the saved record back using only this number." : "Submit an order first. Its number fills in here.";
}
function mark(i, kind, text, detail) {
  state[i] = { kind, text, detail };
  paint();
}

async function timed(method, path, body) {
  const t0 = performance.now();
  const res = await authFetch(API_BASE + path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ms: Math.round(performance.now() - t0), data };
}

const httpPill = (n) => pill("HTTP " + n, n >= 200 && n < 300 ? "ok" : "bad");

function backendCheck() {
  if (signedInUser().isGuest) return mark(3, "warn", "Guest", "Guest mode sends nothing to AWS. Sign in to prove this.");
  const where = API_BASE.startsWith("/") ? "a local server on this computer" : API_BASE.replace(/^https:\/\//, "").replace(/\/api$/, "");
  mark(3, "ok", "Done", "Real responses from " + where);
}

// ---------- step 1 ----------

function willSend() {
  const q = $("gQty").value.trim();
  return $("gSide").value + " " + (q === "" ? "(no quantity)" : q) + " " + $("gSymbol").value;
}
function syncForm() {
  $("gWill").replaceChildren("Will send: ", el("strong", null, willSend()));
  [...$("gQuick").children].forEach((b, i) => {
    const x = EXAMPLES[i];
    b.setAttribute("aria-pressed", String(x.symbol === $("gSymbol").value && x.side === $("gSide").value && x.qty === $("gQty").value.trim()));
  });
}

function copyButton(text) {
  const button = el("button", { type: "button", class: "btn", onclick: async () => {
    try { await navigator.clipboard.writeText(text); button.textContent = "Copied"; } catch (e) { button.textContent = "Select the number and copy it"; }
  } }, "Copy");
  return button;
}

async function submitOrder(e) {
  e.preventDefault();
  const button = $("gSubmit");
  button.disabled = true;
  const sent = willSend();
  $("gResult").replaceChildren(el("p", { class: "muted g-wait" }, "Sending " + sent + "…"));
  const raw = $("gQty").value.trim();
  const body = { symbol: $("gSymbol").value, tradeType: $("gSide").value, quantity: raw === "" ? null : Number(raw), orderType: "Market", requestId: crypto.randomUUID() };
  try {
    const r = await timed("POST", "/trades", body);
    clearCache();
    const d = r.data;
    const ok = d.status === "ACCEPTED";
    const outcome = ok ? "Accepted" : "Rejected: " + (d.reason || "the server refused this order.");
    const guest = signedInUser().isGuest;
    const saved = d.persisted ? (guest ? "Saved in a practice copy in this browser (guest mode, nothing sent to AWS)" : "Saved in the database") + " as " + (ok ? "an Accepted" : "a Rejected") + " record." : "Not saved. No record was written.";
    $("gResult").replaceChildren(el("div", { class: "g-result " + (ok ? "ok" : "bad") },
      el("p", { class: "g-outcome" }, el("span", { class: "g-sym", "aria-hidden": "true" }, ok ? "✓" : "✕"), outcome),
      el("dl", { class: "g-facts" },
        el("dt", null, "Order sent"), el("dd", null, sent),
        el("dt", null, "HTTP status"), el("dd", null, httpPill(r.status), " ", el("span", { class: "muted mono" }, r.ms + " ms")),
        el("dt", null, "Confirmation number"), el("dd", null, d.transactionId ? el("div", { class: "g-idrow" }, el("span", { class: "g-id mono" }, d.transactionId), copyButton(d.transactionId)) : el("span", { class: "muted" }, "None issued")),
        el("dt", null, guest ? "Storage" : "Database"), el("dd", null, saved + (ok && d.account ? " Cash after: " + money(d.account.cashCents) + "." : "")))));
    if (d.transactionId) {
      $("gId").value = d.transactionId;
      lastOrder = { id: d.transactionId, symbol: body.symbol, qty: body.quantity, ok };
      if (ok) mark(0, "ok", "Done", "Confirmation number " + d.transactionId);
    } else if (!ok && state[0].kind !== "ok") {
      mark(0, "", "To do", "That order was rejected. Try the Valid order example.");
    }
    backendCheck();
    paint();
  } catch (err) {
    $("gResult").replaceChildren(errorState("The order could not be sent. " + err.message + hint(err), null));
  }
  button.disabled = false;
}

// ---------- step 2 ----------

const FIELDS = [["transactionId", "Confirmation number"], ["status", "Status"], ["tradeType", "Buy or sell"], ["stockSymbol", "Stock"], ["shareQuantity", "Shares"], ["executionPrice", "Price"], ["transactionValue", "Total"], ["submittedAt", "Submitted"], ["completedAt", "Completed"], ["rejectionReason", "Rejection reason"]];

function matches(t) {
  if (!lastOrder || t.transactionId !== lastOrder.id) return null;
  const statusOk = lastOrder.ok ? /accept|complete/i.test(t.status) : /reject/i.test(t.status);
  return t.stockSymbol === lastOrder.symbol && t.shareQuantity === lastOrder.qty && statusOk;
}

async function retrieve(id, expectMiss) {
  const clean = id.trim();
  if (!clean) return $("gFound").replaceChildren(el("p", { class: "error" }, "Enter a confirmation number, or submit an order in step 1 first."));
  $("gFound").replaceChildren(el("p", { class: "muted g-wait" }, "Reading from the database…"));
  try {
    const r = await timed("GET", "/trades/" + encodeURIComponent(clean));
    const t = r.data.trade;
    const same = t ? matches(t) : null;
    const good = t || expectMiss;
    const head = t ? "Found. This is the saved record." : "Not found: " + (r.data.reason || "no record has this number.");
    $("gFound").replaceChildren(el("div", { class: "g-result " + (good ? "ok" : "bad") },
      el("p", { class: "g-outcome" }, el("span", { class: "g-sym", "aria-hidden": "true" }, good ? "✓" : "✕"), head),
      expectMiss && !t ? el("p", { class: "g-note" }, "That is the correct answer for a number that was never issued.") : null,
      same === true ? el("p", { class: "g-match" }, el("strong", null, "Matches what you submitted:"), " stock, quantity and status are the same.") : null,
      same === false ? el("p", { class: "g-match bad" }, el("strong", null, "Does not match what you submitted."), " Check the stock, shares and status below.") : null,
      el("dl", { class: "g-facts" },
        el("dt", null, "HTTP status"), el("dd", null, httpPill(r.status), " ", el("span", { class: "muted mono" }, r.ms + " ms")),
        ...(t ? FIELDS.filter(([k]) => t[k] !== undefined && t[k] !== null).flatMap(([k, label]) => [el("dt", null, label), el("dd", { class: "mono" }, String(t[k]))]) : []))));
    if (t && !expectMiss) mark(1, "ok", "Done", "Read back " + t.status + " " + t.tradeType + " " + t.shareQuantity + " " + t.stockSymbol);
    backendCheck();
  } catch (err) {
    $("gFound").replaceChildren(errorState("The lookup failed. " + err.message + hint(err), null));
  }
}

// ---------- everything saved for this account (proof the records live in the database) ----------

const hint = (err) => (err && err.status === 0 ? " If this keeps happening, check that the AWS Learner Lab is running." : "");

async function showSaved() {
  $("gSaved").replaceChildren(el("p", { class: "muted g-wait" }, "Reading every saved order…"));
  try {
    const r = await timed("GET", "/trades");
    const list = r.data.trades || [];
    const accepted = list.filter((t) => /accept|complete/i.test(t.status)).length;
    const rejected = list.filter((t) => /reject/i.test(t.status)).length;
    const guest = signedInUser().isGuest;
    $("gSaved").replaceChildren(el("div", { class: "g-result " + (r.status === 200 ? "ok" : "bad") },
      el("p", { class: "g-outcome" }, el("span", { class: "g-sym", "aria-hidden": "true" }, r.status === 200 ? "✓" : "✕"),
        list.length + " saved " + (list.length === 1 ? "record" : "records") + ": " + accepted + " Accepted, " + rejected + " Rejected"),
      el("p", { class: "g-note" }, guest ? "Read from the practice copy in this browser (guest mode)." : "Read from DynamoDB, newest first. Rejected orders are kept too, each with its reason.", " ", httpPill(r.status), " ", el("span", { class: "muted mono" }, r.ms + " ms")),
      list.length ? el("ul", { class: "g-saved" }, list.slice(0, 10).map((t) => el("li", null,
        statusPill(/reject/i.test(t.status) ? "Rejected" : "Accepted"),
        el("span", { class: "g-s-order" }, t.tradeType + " " + t.shareQuantity + " " + t.stockSymbol),
        el("span", { class: "g-s-why muted" }, t.rejectionReason || ("at " + t.executionPrice)),
        el("span", { class: "g-s-id mono muted" }, t.transactionId)))) : null,
      list.length > 10 ? el("p", { class: "g-note" }, "Showing the newest 10 of " + list.length + ".") : null));
    backendCheck();
  } catch (err) {
    $("gSaved").replaceChildren(errorState("The list could not be read. " + err.message + hint(err), null));
  }
}

// ---------- business rules and their tests ----------

const RULES = [
  ["BR-1", "Trade type must be Buy or Sell", ["T08"]],
  ["BR-2", "The stock must be one we support", ["T07"]],
  ["BR-3", "Shares must be a positive whole number", ["T03", "T04", "T05", "T06"]],
  ["BR-4", "A Buy needs enough cash", ["T11", "T12"]],
  ["BR-5", "A Sell needs enough shares", ["T13", "T14"]],
  ["BR-6", "A valid, recent price is required (15 minutes at most)", [], "Every accepted order uses one; the 15-minute limit is covered by the automated tests"],
  ["BR-7", "An accepted trade updates cash and holdings", ["T01", "T02", "T11", "T13", "T15"]],
  ["BR-8", "A rejected trade changes nothing and is still recorded", ["T03", "T04", "T05", "T06", "T07", "T08", "T09", "T12", "T14", "T17"]],
  ["BR-9", "Only Market orders are supported", ["T09"]]
];
const EXTRA = [
  ["Duplicate", "The same request sent twice is placed once", ["T15"]],
  ["Retrieval", "A saved order is read back by its number; unknown numbers return 404", ["T16", "T17", "T18", "T19", "T20"]],
  ["Access", "No token gets 401; a normal user cannot reach admin routes", ["T22", "T23"]]
];

function ruleResult(tests, results) {
  if (!results) return [el("span", { class: "muted" }, "Run step 3")];
  if (!tests.length) return [el("span", { class: "muted" }, "Automated tests")];
  const ran = tests.map((id) => results.find((x) => x.id === id)).filter((x) => x && x.ok !== null);
  if (!ran.length) return [el("span", { class: "muted" }, "Not run here")];
  const bad = ran.filter((x) => x.ok === false).length;
  return [pill((bad ? "✕ " : "✓ ") + (ran.length - bad) + " of " + ran.length + " passed", bad ? "bad" : "ok")];
}

function paintRules(results) {
  const row = ([id, text, tests, note]) => el("tr", null,
    el("th", { scope: "row", class: "mono" }, id),
    el("td", null, text, note ? el("small", { class: "muted" }, note) : null),
    el("td", { class: "mono" }, tests.length ? tests.join(", ") : "–"),
    el("td", null, ...ruleResult(tests, results)));
  $("gRules").replaceChildren(
    el("thead", null, el("tr", null, el("th", { scope: "col" }, "Rule"), el("th", { scope: "col" }, "What it means"), el("th", { scope: "col" }, "Tests"), el("th", { scope: "col" }, "Result"))),
    el("tbody", null, ...RULES.map(row), el("tr", { class: "g-rules-sub" }, el("td", { colspan: "4" }, "Also tested")), ...EXTRA.map(row)));
}

// ---------- who is checking: signed in, guest or neither ----------

function paintWho() {
  const u = signedInUser();
  const local = API_BASE.startsWith("/");
  const back = "signin.html?back=" + encodeURIComponent(location.pathname);
  let kind, label, line, action;
  if (u && u.isGuest) {
    kind = "warn";
    label = "Guest";
    line = ["You are a guest. Orders are simulated in this browser and nothing is sent to AWS, so this does not prove the backend."];
    action = el("a", { class: "btn", href: back }, "Sign in");
  } else if (u) {
    kind = "ok";
    label = "Signed in";
    line = [el("strong", null, u.email), u.isAdmin ? " (admin)" : "", ". Every request carries your Cognito sign-in token to " + (local ? "the local server" : "the deployed API") + "."];
    action = el("button", { type: "button", class: "btn", onclick: signOut }, "Sign out");
  } else {
    kind = "bad";
    label = "Not signed in";
    line = ["Sign in to run the checks. Requests without a token are refused with 401."];
    action = el("a", { class: "btn primary", href: back }, "Sign in");
  }
  $("gWho").className = "g-who " + kind;
  $("gWho").replaceChildren(pill((kind === "ok" ? "✓ " : kind === "warn" ? "! " : "✕ ") + label, kind), el("span", { class: "g-who-text" }, ...line), action);
}

// ---------- where this runs ----------

function facts() {
  const guest = signedInUser().isGuest;
  const local = API_BASE.startsWith("/");
  const rows = [
    ["Website", location.host + (local ? " (local copy)" : " (AWS Amplify)")],
    ["API", local ? "A local server stands in for API Gateway" : "Amazon API Gateway"],
    ["Sign-in", guest ? "Guest. No token, so nothing is sent to AWS." : "Amazon Cognito. The API checks your token on every request."],
    ["Rules", "AWS Lambda checks every order"],
    ["Database", "Amazon DynamoDB keeps one record per order, Accepted or Rejected"]
  ];
  $("gFacts").replaceChildren(...rows.flatMap(([k, v]) => [el("dt", null, k), el("dd", null, v)]));
}

// ---------- start ----------

$("gSymbol").replaceChildren(...Object.keys(STOCKS).map((s) => el("option", { value: s }, s + " · " + STOCKS[s].name)));
$("gQuick").replaceChildren(...EXAMPLES.map((x) => el("button", { type: "button", class: "btn g-chip", "aria-pressed": "false", onclick: () => {
  $("gSymbol").value = x.symbol;
  $("gSide").value = x.side;
  $("gQty").value = x.qty;
  syncForm();
} }, x.name)));
["gSymbol", "gSide"].forEach((id) => $(id).addEventListener("change", syncForm));
$("gQty").addEventListener("input", syncForm);
$("gId").addEventListener("input", paint);
$("gForm").addEventListener("submit", submitOrder);
$("gLookup").addEventListener("submit", (e) => { e.preventDefault(); retrieve($("gId").value, false); });
$("gList").addEventListener("click", showSaved);
$("gMissing").addEventListener("click", () => retrieve("00000000-0000-4000-8000-000000000000", true));
document.addEventListener("matrix-finished", (e) => {
  const { pass, fail, na, total, results } = e.detail;
  paintRules(results);
  mark(2, fail ? "bad" : "ok", fail ? "Failed" : "Done", pass + " of " + total + " passed" + (fail ? ", " + fail + " failed" : "") + (na ? ", " + na + " not run" : ""));
  backendCheck();
});
facts();
paintWho();
syncForm();
paintRules(null);
paint();
