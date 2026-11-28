"use strict";
// Runs the Milestone 4 test matrix against a MarketStreet API and writes the results.
//   Local:    node Testing/Final-Milestone/run-matrix.js
//   Deployed: BASE=https://<api-id>.execute-api.us-east-1.amazonaws.com/api TOKEN=<Cognito ID token> node Testing/Final-Milestone/run-matrix.js
//             (optional OTHER_TOKEN=<a second user's ID token> adds the "another user cannot read it" case)
// Every case sends the same JSON the order form sends. The run resets the tester's paper account first,
// so it starts from $10,000.00 cash and no holdings.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const BASE = (process.env.BASE || "http://localhost:3000/api").replace(/\/$/, "");
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const unsigned = (sub, extra = {}) => { const t = Math.floor(Date.now() / 1000); return b64({ alg: "none" }) + "." + b64({ exp: t + 3600, iat: t, sub, email: sub + "@marketstreet.test", nickname: "Matrix tester", ...extra }) + ".x"; };
const local = !process.env.TOKEN;
const TOKEN = process.env.TOKEN || unsigned("matrix-" + Date.now());
const OTHER = process.env.OTHER_TOKEN || (local ? unsigned("matrix-other-" + Date.now()) : "");

async function call(method, p, body, token = TOKEN) {
  const headers = {};
  if (token) headers.Authorization = "Bearer " + token;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + p, { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const order = (symbol, tradeType, quantity, extra = {}) => ({ symbol, tradeType, quantity, orderType: "Market", ...extra });
const form = (symbol, side, shares) => "Stock " + symbol + " · " + side + " · Shares " + shares + " · Order type Market";
const pre = (p, inputs) => "Precondition: " + p + "\n" + inputs;
const CLEAN = "cash $10,000.00, no shares held";
const json = (o) => "\nJSON sent: " + JSON.stringify(o);
const money = (c) => "$" + (c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 });
const rows = [];
const ids = {};

async function reset() {
  await call("POST", "/account/reset", { confirm: "RESET" });
}
async function cash() {
  return (await call("GET", "/account")).body.account.cashCents;
}

// A case: type, name, inputs (what a tester enters), expected, and run() returning { actual, ok }
async function add(id, type, name, inputs, expected, run) {
  let out;
  try {
    out = await run();
  } catch (e) {
    out = { actual: "Error: " + e.message, ok: false };
  }
  rows.push({ id, type, name, inputs, expected, actual: out.actual, result: out.ok === null ? "N/A" : out.ok ? "Pass" : "Fail" });
}

const reply = (r) => r.status + " " + (r.body.status || (r.body.success ? "OK" : "ERROR"));
const rejected = (r, reason) => r.status === 400 && r.body.status === "REJECTED" && r.body.reason === reason;

(async () => {
  await reset();

  // ---------- Valid transactions ----------
  let r;
  await add("T01", "Valid", "Buy 1 share of AAPL", pre("account reset to $10,000.00 cash and no holdings (the run does this first; a new account starts the same way).", form("AAPL", "Buy", 1)), "200 ACCEPTED; confirmation number returned; cash becomes $9,814.50; record saved", async () => {
    r = await call("POST", "/trades", order("AAPL", "Buy", 1));
    ids.t01 = r.body.transactionId;
    const c = await cash();
    return { actual: reply(r) + "; confirmation " + ids.t01 + "; cash " + money(c) + "; persisted " + r.body.persisted, ok: r.status === 200 && r.body.status === "ACCEPTED" && r.body.persisted === true && /^[0-9a-f-]{36}$/.test(ids.t01) && c === 981450 };
  });
  await add("T02", "Valid", "Sell the share just bought", pre("after T01: cash $9,814.50, owns 1 AAPL.", form("AAPL", "Sell", 1)), "200 ACCEPTED; cash returns to $10,000.00", async () => {
    r = await call("POST", "/trades", order("AAPL", "Sell", 1));
    const c = await cash();
    return { actual: reply(r) + "; cash " + money(c), ok: r.status === 200 && r.body.status === "ACCEPTED" && c === 1000000 };
  });

  // ---------- Invalid transactions ----------
  const invalid = [
    ["T03", "Quantity 0", pre("after T02: " + CLEAN + ".", form("AAPL", "Buy", 0)), order("AAPL", "Buy", 0), "Quantity must be a positive whole number."],
    ["T04", "Quantity 1.5 (fraction)", pre(CLEAN + " (T03 changed nothing).", form("AAPL", "Buy", "1.5")), order("AAPL", "Buy", 1.5), "Quantity must be a positive whole number."],
    ["T05", "Quantity -3 (negative)", pre(CLEAN + ".", form("AAPL", "Buy", -3)), order("AAPL", "Buy", -3), "Quantity must be a positive whole number."],
    ["T06", "Quantity sent as text (bypassing the browser)", pre(CLEAN + ".", "API only (the form cannot send text): Stock AAPL · Buy · Shares \"2\" (a text string, not a number) · Order type Market" + json(order("AAPL", "Buy", "2"))), order("AAPL", "Buy", "2"), "Quantity must be a positive whole number."],
    ["T07", "Unknown stock symbol", pre(CLEAN + ".", form("XYZ", "Buy", 1)), order("XYZ", "Buy", 1), "Stock not found."],
    ["T08", "Invalid trade type", pre(CLEAN + ".", "API only (the form offers only Buy or Sell): Stock AAPL · Trade type Hold · Shares 1 · Order type Market" + json(order("AAPL", "Hold", 1))), order("AAPL", "Hold", 1), "Trade type must be Buy or Sell."],
    ["T09", "Limit order (not supported, BR-9)", pre(CLEAN + ".", "API only (the form has no order type choice): Stock AAPL · Buy · Shares 1 · Order type Limit" + json(order("AAPL", "Buy", 1, { orderType: "Limit" }))), order("AAPL", "Buy", 1, { orderType: "Limit" }), "Limit orders are not supported."]
  ];
  for (const [id, name, inputs, body, reason] of invalid) {
    await add(id, "Invalid", name, inputs, "400 REJECTED, \"" + reason + "\"; a Rejected record is saved; cash unchanged", async () => {
      const before = await cash();
      r = await call("POST", "/trades", body);
      ids[id] = r.body.transactionId;
      const after = await cash();
      return { actual: reply(r) + ", \"" + r.body.reason + "\"; record " + (r.body.persisted ? "saved" : "not saved") + "; cash " + money(after), ok: rejected(r, reason) && r.body.persisted === true && before === after };
    });
  }
  await add("T10", "Invalid", "Empty request body", pre(CLEAN + ".", "API only: POST /api/trades, signed in, with an empty body (no stock, trade type, shares or order type)"), "400 REJECTED, \"A JSON request body is required.\"", async () => {
    r = await call("POST", "/trades", "");
    return { actual: reply(r) + ", \"" + r.body.reason + "\"", ok: rejected(r, "A JSON request body is required.") };
  });

  // ---------- Boundary and business-rule conditions ----------
  await add("T11", "Boundary", "Largest affordable Buy is accepted (82 × $121.40 = $9,954.80)", pre("after T10: " + CLEAN + ".", form("NVDA", "Buy", 82)), "200 ACCEPTED; cash becomes $45.20", async () => {
    r = await call("POST", "/trades", order("NVDA", "Buy", 82));
    const c = await cash();
    return { actual: reply(r) + "; cash " + money(c), ok: r.status === 200 && c === 4520 };
  });
  await add("T12", "Boundary", "One more share than the cash covers is rejected", pre("after T11: cash $45.20, owns 82 NVDA.", form("NVDA", "Buy", 1) + " (1 × $121.40 is more than $45.20)"), "400 REJECTED, \"Insufficient cash.\"; cash unchanged", async () => {
    r = await call("POST", "/trades", order("NVDA", "Buy", 1));
    return { actual: reply(r) + ", \"" + r.body.reason + "\"; cash " + money(await cash()), ok: rejected(r, "Insufficient cash.") && (await cash()) === 4520 };
  });
  await add("T13", "Boundary", "Sell exactly the shares owned is accepted", pre("after T12: cash $45.20, owns 82 NVDA.", form("NVDA", "Sell", 82)), "200 ACCEPTED; holdings become 0; cash returns to $10,000.00", async () => {
    r = await call("POST", "/trades", order("NVDA", "Sell", 82));
    const c = await cash();
    return { actual: reply(r) + "; cash " + money(c), ok: r.status === 200 && c === 1000000 };
  });
  await add("T14", "Boundary", "Sell one more share than owned is rejected (no short selling)", pre("after T13: cash $10,000.00, owns 0 NVDA.", form("NVDA", "Sell", 1)), "400 REJECTED, \"Insufficient shares.\"; cash unchanged", async () => {
    r = await call("POST", "/trades", order("NVDA", "Sell", 1));
    return { actual: reply(r) + ", \"" + r.body.reason + "\"", ok: rejected(r, "Insufficient shares.") };
  });
  await add("T15", "Business rule", "Retried order is not placed twice (duplicate control)", pre("after T14: " + CLEAN + ".", "The same order sent twice with the same requestId (a new random UUID): " + form("MSFT", "Buy", 1)), "First 200 ACCEPTED; second returns the first result with duplicate: true; cash debited once ($412.30)", async () => {
    const requestId = crypto.randomUUID();
    const a = await call("POST", "/trades", order("MSFT", "Buy", 1, { requestId }));
    const b = await call("POST", "/trades", order("MSFT", "Buy", 1, { requestId }));
    const c = await cash();
    return { actual: reply(a) + " then " + reply(b) + " duplicate=" + b.body.duplicate + ", same confirmation: " + (a.body.transactionId === b.body.transactionId) + "; cash " + money(c), ok: a.status === 200 && b.body.duplicate === true && a.body.transactionId === b.body.transactionId && c === 1000000 - 41230 };
  });

  // ---------- Retrieval ----------
  await add("T16", "Retrieval", "Retrieve an Accepted transaction by confirmation number", "Precondition: signed in as the account that placed T01.\nConfirmation number from T01: " + ids.t01, "200; status Accepted with the stored order, price, total and times", async () => {
    r = await call("GET", "/trades/" + ids.t01);
    const t = r.body.trade || {};
    return { actual: r.status + " status " + t.status + ", " + t.tradeType + " " + t.shareQuantity + " " + t.stockSymbol + " at " + t.executionPrice + ", submitted " + t.submittedAt, ok: r.status === 200 && t.status === "Accepted" && t.transactionId === ids.t01 };
  });
  await add("T17", "Retrieval", "Retrieve a Rejected transaction (rejections are stored)", "Precondition: signed in as the account that placed T03.\nConfirmation number from T03: " + ids.T03, "200; status Rejected with rejectionReason and category Rule", async () => {
    r = await call("GET", "/trades/" + ids.T03);
    const t = r.body.trade || {};
    return { actual: r.status + " status " + t.status + ", \"" + t.rejectionReason + "\", category " + t.rejectionCategory, ok: r.status === 200 && t.status === "Rejected" && t.rejectionCategory === "Rule" };
  });
  await add("T18", "Retrieval", "Confirmation number that does not exist", "Precondition: signed in (any account).\nConfirmation number: 00000000-0000-4000-8000-000000000000 (GET /api/trades/<number>)", "404 \"Trade not found.\"", async () => {
    r = await call("GET", "/trades/00000000-0000-4000-8000-000000000000");
    return { actual: r.status + " \"" + r.body.reason + "\"", ok: r.status === 404 && r.body.reason === "Trade not found." };
  });
  await add("T19", "Retrieval", "Malformed confirmation number", "Precondition: signed in (any account).\nConfirmation number: abc123 (GET /api/trades/abc123)", "404 \"Trade not found.\"", async () => {
    r = await call("GET", "/trades/abc123");
    return { actual: r.status + " \"" + r.body.reason + "\"", ok: r.status === 404 };
  });
  await add("T20", "Retrieval", "Persistence: the order list comes from the database", "Precondition: signed in as the account that ran T01 to T15.\nGET /api/trades", "200; list holds Accepted and Rejected records, newest first", async () => {
    r = await call("GET", "/trades");
    const list = r.body.trades || [];
    const ok = r.status === 200 && list.some((t) => t.status === "Accepted") && list.some((t) => t.status === "Rejected") && list[0].submittedAt >= list[list.length - 1].submittedAt;
    return { actual: r.status + ", " + list.length + " records (" + list.filter((t) => t.status === "Accepted").length + " Accepted, " + list.filter((t) => t.status === "Rejected").length + " Rejected)", ok };
  });
  if (OTHER) {
    await add("T21", "Retrieval", "Another user cannot read this transaction", "Precondition: a second, different signed-in user.\nConfirmation number from T01, requested with the second user's token (GET /api/trades/<T01 number>)", "404 \"Trade not found.\" (nothing about the record is revealed)", async () => {
      r = await call("GET", "/trades/" + ids.t01, undefined, OTHER);
      return { actual: r.status + " \"" + r.body.reason + "\"", ok: r.status === 404 };
    });
  }

  // ---------- Errors and access control ----------
  await add("T22", "Error handling", "Request without a sign-in token", "No sign-in: POST /api/trades with no Authorization header\nBody: " + form("AAPL", "Buy", 1), "401 (rejected before any processing)", async () => {
    r = await call("POST", "/trades", order("AAPL", "Buy", 1), "");
    return { actual: String(r.status) + (r.body.reason ? " \"" + r.body.reason + "\"" : r.body.message ? " \"" + r.body.message + "\"" : ""), ok: r.status === 401 };
  });
  await add("T23", "Error handling", "A normal user cannot call an admin route", "Precondition: signed in as a normal (non-admin) user.\nGET /api/admin/users", "403 \"Admins only.\"", async () => {
    r = await call("GET", "/admin/users");
    return { actual: r.status + " \"" + r.body.reason + "\"", ok: r.status === 403 };
  });
  await add("T24", "Error handling", "Database failure while saving", "Cannot be reproduced safely on the live system.\nUnit test input: Stock AAPL · Buy · Shares 1 · Order type Market, with the database made to fail during the save", "Cash and holdings unchanged; the user is told the trade was not saved; a Rejected record (category System) is written if the database allows", async () => ({
    actual: "Not run live. Covered by the unit test \"a failed commit is recorded as a System rejection and answered with 500\" (aws/lambda/tests/platform.test.js): a simulated DynamoDB failure returns 500 \"The trade could not be saved. Please try again.\" and the order is stored as Rejected, category System.", ok: null }));

  const pass = rows.filter((x) => x.result === "Pass").length;
  const fail = rows.filter((x) => x.result === "Fail").length;
  const dir = __dirname;
  const csvCell = (v) => '"' + String(v).replace(/"/g, '""') + '"';
  const header = ["Test", "Type", "Name", "Inputs", "Expected", "Actual", "Result"];
  fs.writeFileSync(path.join(dir, "test-matrix.csv"), "﻿" + [header, ...rows.map((x) => [x.id, x.type, x.name, x.inputs, x.expected, x.actual, x.result])].map((l) => l.map(csvCell).join(",")).join("\r\n"));
  const md = [
    "# MarketStreet test matrix", "",
    "Run against `" + BASE + "` on " + new Date().toISOString() + ". " + pass + " passed, " + fail + " failed, " + (rows.length - pass - fail) + " explained.", "",
    "| Test | Type | Name | Inputs | Expected | Actual | Result |", "|---|---|---|---|---|---|---|",
    ...rows.map((x) => "| " + [x.id, x.type, x.name, x.inputs, x.expected, x.actual, x.result].map((v) => String(v).replace(/\|/g, "\\|").replace(/\n/g, "<br>")).join(" | ") + " |")
  ];
  fs.writeFileSync(path.join(dir, "test-matrix.md"), md.join("\n") + "\n");
  console.log(rows.map((x) => x.id + " " + x.result.padEnd(4) + " " + x.name).join("\n"));
  console.log("\n" + pass + " passed, " + fail + " failed, " + (rows.length - pass - fail) + " explained against " + BASE);
  process.exit(fail ? 1 : 0);
})();
