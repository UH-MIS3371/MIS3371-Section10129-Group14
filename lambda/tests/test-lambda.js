"use strict";
// Run locally:     node lambda/tests/test-lambda.js
// Run against AWS: API_URL=https://59w9sz4rrl.execute-api.us-east-1.amazonaws.com/api/trades node lambda/tests/test-lambda.js
// Each case sends a trade and compares the expected and actual HTTP code, status, and message.
const { handler } = require("../index");

const API_URL = process.env.API_URL;
const base = { symbol: "AAPL", tradeType: "Buy", quantity: 1, orderType: "Market", price: 185.5, cash: 10000, sharesOwned: 10 };

// body can be an object (sent as JSON) or a raw string (sent as-is)
const tests = [
  { name: "TC-01 Buy 1 AAPL", body: { ...base }, code: 200, status: "ACCEPTED", text: "Buy order accepted." },
  { name: "TC-02 Sell 1 AAPL", body: { ...base, tradeType: "Sell" }, code: 200, status: "ACCEPTED", text: "Sell order accepted." },
  { name: "TC-03 Buy 54 (insufficient cash)", body: { ...base, quantity: 54 }, code: 400, status: "REJECTED", text: "Insufficient cash." },
  { name: "TC-04 Sell 11 (insufficient shares)", body: { ...base, tradeType: "Sell", quantity: 11 }, code: 400, status: "REJECTED", text: "Insufficient shares." },
  { name: "TC-05 Quantity 0", body: { ...base, quantity: 0 }, code: 400, status: "REJECTED", text: "Quantity must be a positive whole number." },
  { name: "TC-06 Quantity 0.5", body: { ...base, quantity: 0.5 }, code: 400, status: "REJECTED", text: "Quantity must be a positive whole number." },
  { name: "TC-07 Buy 53 (max affordable)", body: { ...base, quantity: 53 }, code: 200, status: "ACCEPTED", text: "Buy order accepted." },
  { name: "TC-08 Sell 10 (all shares)", body: { ...base, tradeType: "Sell", quantity: 10 }, code: 200, status: "ACCEPTED", text: "Sell order accepted." },
  { name: "TC-09 Unsupported symbol XYZ", body: { ...base, symbol: "XYZ" }, code: 400, status: "REJECTED", text: "Stock not found." },
  { name: "TC-10 Limit order", body: { ...base, orderType: "Limit" }, code: 400, status: "REJECTED", text: "Only Market orders are supported." },
  { name: "Symbol with spaces and lowercase", body: { ...base, symbol: " aapl " }, code: 200, status: "ACCEPTED", text: "Buy order accepted." },
  { name: "Negative quantity", body: { ...base, quantity: -3 }, code: 400, status: "REJECTED", text: "Quantity must be a positive whole number." },
  { name: "Sell 0 shares", body: { ...base, tradeType: "Sell", quantity: 0 }, code: 400, status: "REJECTED", text: "Quantity must be a positive whole number." },
  { name: "String quantity", body: { ...base, quantity: "2" }, code: 400, status: "REJECTED", text: "Quantity must be a positive whole number." },
  { name: "Null quantity", body: { ...base, quantity: null }, code: 400, status: "REJECTED", text: "Quantity must be a positive whole number." },
  { name: "Bad trade type", body: { ...base, tradeType: "Hold" }, code: 400, status: "REJECTED", text: "Trade type must be Buy or Sell." },
  { name: "Missing symbol", body: { tradeType: "Buy", quantity: 1, orderType: "Market" }, code: 400, status: "REJECTED", text: "Stock not found." },
  { name: "Missing order type", body: { ...base, orderType: undefined }, code: 400, status: "REJECTED", text: "Only Market orders are supported." },
  { name: "Fake price and cash are ignored (Buy 54)", body: { ...base, quantity: 54, price: 1, cash: 999999 }, code: 400, status: "REJECTED", text: "Insufficient cash." },
  { name: "Fake shares are ignored (Sell 11)", body: { ...base, tradeType: "Sell", quantity: 11, sharesOwned: 500 }, code: 400, status: "REJECTED", text: "Insufficient shares." },
  { name: "Malformed JSON", body: "{oops", code: 400, status: "REJECTED", text: "Request body must be valid JSON." },
  { name: "Empty body", body: "", code: 400, status: "REJECTED", text: "A JSON request body is required." },
  { name: "JSON null", body: "null", code: 400, status: "REJECTED", text: "A JSON trade object is required." },
  { name: "JSON array", body: "[1,2]", code: 400, status: "REJECTED", text: "A JSON trade object is required." }
];

// Sends one test case to the Lambda handler (a fake API Gateway v2 event) or to the real API
async function send(body) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  if (API_URL) {
    const res = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: raw });
    return { code: res.status, json: await res.json() };
  }
  const event = { version: "2.0", routeKey: "POST /api/trades", requestContext: { http: { method: "POST" } }, body: raw };
  const res = await handler(event);
  return { code: res.statusCode, json: JSON.parse(res.body) };
}

async function run() {
  console.log(API_URL ? "Testing the real API: " + API_URL : "Testing the Lambda handler locally");
  let total = tests.length;
  let passed = 0;
  for (const t of tests) {
    const actual = await send(t.body);
    const actualText = actual.json.reason || actual.json.message;
    const ok = actual.code === t.code && actual.json.status === t.status && actualText === t.text;
    if (ok) passed++;
    console.log((ok ? "PASS" : "FAIL") + ": " + t.name);
    console.log("  Expected: " + t.code + ", " + t.status + ", " + t.text);
    console.log("  Actual:   " + actual.code + ", " + actual.json.status + ", " + actualText);
  }

  // Handler-only checks (a real API Gateway answers some of these itself)
  if (!API_URL) {
    const post = { requestContext: { http: { method: "POST" } } };
    const extra = [
      ["OPTIONS returns 204", (await handler({ requestContext: { http: { method: "OPTIONS" } } })).statusCode === 204],
      ["GET returns 405", (await handler({ requestContext: { http: { method: "GET" } } })).statusCode === 405],
      ["Missing body returns 400", (await handler(post)).statusCode === 400],
      ["Empty event does not crash", (await handler()).statusCode === 400],
      ["Object body is accepted", (await handler({ ...post, body: base })).statusCode === 200],
      ["Base64 body is accepted", (await handler({ ...post, isBase64Encoded: true, body: Buffer.from(JSON.stringify(base)).toString("base64") })).statusCode === 200],
      ["CORS header is sent", (await handler({ ...post, body: JSON.stringify(base) })).headers["Access-Control-Allow-Origin"] === "*"]
    ];
    for (const [name, ok] of extra) {
      total++;
      if (ok) passed++;
      console.log((ok ? "PASS" : "FAIL") + ": " + name);
    }
  }

  console.log("\nResults: " + passed + "/" + total + " tests passed");
  if (passed !== total) process.exit(1);
}

run();
