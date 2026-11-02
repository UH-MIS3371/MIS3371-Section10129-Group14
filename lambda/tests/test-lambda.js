"use strict";
// Run locally:     cd lambda && npm install && npm test
// Run against AWS: API_URL=https://59w9sz4rrl.execute-api.us-east-1.amazonaws.com/api/trades node lambda/tests/test-lambda.js
// Each case sends a trade and compares the expected and actual HTTP code, status, message,
// and whether the trade was saved. Locally, DynamoDB is replaced by an in-memory table.
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");

const API_URL = process.env.API_URL;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---- Local fake DynamoDB (only used when API_URL is not set) ----
const table = new Map();
let dbFails = false;
if (!API_URL) {
  process.env.TABLE_NAME = "MarketStreetTrades-test";
  process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
  DynamoDBDocumentClient.prototype.send = async function (command) {
    if (dbFails) throw new Error("Simulated DynamoDB failure (secret internal detail)");
    if (command.input.TableName !== process.env.TABLE_NAME) throw new Error("Wrong table: " + command.input.TableName);
    if (command instanceof PutCommand) {
      const item = command.input.Item;
      if (table.has(item.transactionId)) {
        const e = new Error("The conditional request failed");
        e.name = "ConditionalCheckFailedException";
        throw e;
      }
      table.set(item.transactionId, structuredClone(item));
      return {};
    }
    if (command instanceof GetCommand) {
      const item = table.get(command.input.Key.transactionId);
      return item ? { Item: structuredClone(item) } : {};
    }
    throw new Error("Unexpected command: " + command.constructor.name);
  };
}
const { handler } = require("../index");

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

// Sends a trade to the Lambda handler (a fake API Gateway v2 event) or to the real API
async function post(body) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  if (API_URL) {
    const res = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: raw });
    return { code: res.status, json: await res.json() };
  }
  const event = { version: "2.0", routeKey: "POST /api/trades", requestContext: { http: { method: "POST" } }, body: raw };
  const res = await handler(event);
  return { code: res.statusCode, json: JSON.parse(res.body) };
}

// Reads one saved trade, the same way API Gateway calls GET /api/trades/{transactionId}
async function get(id) {
  if (API_URL) {
    const res = await fetch(API_URL + "/" + encodeURIComponent(id));
    return { code: res.status, json: await res.json() };
  }
  const event = { version: "2.0", routeKey: "GET /api/trades/{transactionId}", requestContext: { http: { method: "GET" } }, pathParameters: { transactionId: id } };
  const res = await handler(event);
  return { code: res.statusCode, json: JSON.parse(res.body) };
}

async function run() {
  console.log(API_URL ? "Testing the real API: " + API_URL : "Testing the Lambda handler locally");
  let total = 0;
  let passed = 0;
  function check(name, ok, detail) {
    total++;
    if (ok) passed++;
    console.log((ok ? "PASS" : "FAIL") + ": " + name + (detail ? "\n  " + detail : ""));
  }

  // Business rule cases: accepted trades must be saved, rejected trades must not be
  for (const t of tests) {
    const actual = await post(t.body);
    const actualText = actual.json.reason || actual.json.message;
    const shouldSave = t.status === "ACCEPTED";
    const saved = actual.json.persisted === true && UUID.test(actual.json.transactionId || "");
    const ok = actual.code === t.code && actual.json.status === t.status && actualText === t.text && saved === shouldSave;
    check(t.name, ok,
      "Expected: " + t.code + ", " + t.status + ", " + t.text + ", saved=" + shouldSave +
      "\n  Actual:   " + actual.code + ", " + actual.json.status + ", " + actualText + ", saved=" + saved);
  }
  if (!API_URL) {
    const accepted = tests.filter((t) => t.status === "ACCEPTED").length;
    check("Only accepted trades are in the table (" + accepted + ")", table.size === accepted, "Table has " + table.size + " records");
  }

  // POST then GET returns the same server-built record
  const saved = await post({ ...base, symbol: " msft ", tradeType: "Sell", quantity: 2, price: 1, transactionId: "hacked", status: "Rejected", submittedAt: "2000-01-01T00:00:00.000Z" });
  const id = saved.json.transactionId;
  check("POST Sell 2 MSFT is saved with a server UUID", saved.code === 200 && saved.json.persisted === true && UUID.test(id || "") && id !== "hacked");
  const found = await get(id);
  const trade = found.json.trade || {};
  const expected = { transactionId: id, stockSymbol: "MSFT", tradeType: "Sell", shareQuantity: 2, orderType: "Market", executionPrice: 412.3, transactionValue: 824.6, status: "Accepted", submittedAt: saved.json.submittedAt };
  const fieldsOk = Object.keys(expected).every((k) => trade[k] === expected[k]);
  check("GET returns the saved record with server price, ID, status and time", found.code === 200 && found.json.success === true && fieldsOk,
    "Got: " + found.code + " " + JSON.stringify(trade));
  check("Browser price, cash and shares are not saved", !("price" in trade) && !("cash" in trade) && !("sharesOwned" in trade));
  check("GET unknown transactionId returns 404", (await get("00000000-0000-4000-8000-000000000000")).code === 404);
  check("GET non-UUID transactionId returns 404", (await get("TRD-00418")).code === 404);

  // Handler-only checks (a real API Gateway answers some of these itself)
  if (!API_URL) {
    const postEvent = { requestContext: { http: { method: "POST" } } };
    const getEvent = { requestContext: { http: { method: "GET" } } };
    check("OPTIONS returns 204", (await handler({ requestContext: { http: { method: "OPTIONS" } } })).statusCode === 204);
    check("PUT returns 405", (await handler({ requestContext: { http: { method: "PUT" } } })).statusCode === 405);
    check("Missing body returns 400", (await handler(postEvent)).statusCode === 400);
    check("Empty event does not crash", (await handler()).statusCode === 400);
    check("Object body is accepted", (await handler({ ...postEvent, body: base })).statusCode === 200);
    check("Base64 body is accepted", (await handler({ ...postEvent, isBase64Encoded: true, body: Buffer.from(JSON.stringify(base)).toString("base64") })).statusCode === 200);
    const cors = (await handler({ ...postEvent, body: JSON.stringify(base) })).headers;
    check("CORS headers are sent and allow GET", cors["Access-Control-Allow-Origin"] === "*" && cors["Access-Control-Allow-Methods"].includes("GET"));
    check("GET without pathParameters returns 400", (await handler(getEvent)).statusCode === 400);
    check("GET with a blank transactionId returns 400", (await handler({ ...getEvent, pathParameters: { transactionId: " " } })).statusCode === 400);

    // Database failures return a controlled 500 and never leak the internal error
    dbFails = true;
    const before = table.size;
    const failedPost = await post(base);
    check("POST when DynamoDB fails returns 500, persisted false", failedPost.code === 500 && failedPost.json.persisted === false && failedPost.json.status === "ERROR");
    check("DynamoDB error details are not sent to the browser", !JSON.stringify(failedPost.json).includes("secret"));
    check("GET when DynamoDB fails returns 500", (await get(id)).code === 500);
    dbFails = false;
    check("Nothing was saved during the failure", table.size === before);

    // Missing TABLE_NAME: accepted trades fail safely, rejected trades are still rejected
    delete process.env.TABLE_NAME;
    const noTable = await post(base);
    check("POST without TABLE_NAME returns 500, persisted false", noTable.code === 500 && noTable.json.persisted === false);
    check("Rejected trade without TABLE_NAME still returns 400", (await post({ ...base, quantity: 0 })).code === 400);
    check("GET without TABLE_NAME returns 500", (await get(id)).code === 500);
    process.env.TABLE_NAME = "MarketStreetTrades-test";
  }

  console.log("\nResults: " + passed + "/" + total + " tests passed");
  if (passed !== total) process.exit(1);
}

run();
