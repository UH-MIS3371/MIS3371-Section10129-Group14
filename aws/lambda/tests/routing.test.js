"use strict";
// Routing and read-consistency checks through the real handler, with DynamoDB replaced by the in-memory
// stand-in from local-server.js: only POST /api/trades places a trade, unknown paths get 404, a wrong method
// gets 405 (not a trade rejection), confirmation numbers are found in any letter case, and the reads that
// follow a write are strongly consistent.
// Run: cd aws/lambda && npm test
const test = require("node:test");
const assert = require("node:assert");

const { installFakeDynamoDB } = require("../local-server");
const fake = installFakeDynamoDB();
process.env.TABLE_NAME = "Trades-test";
process.env.ACCOUNTS_TABLE = "Accounts-test";
process.env.GAMES_TABLE = "Games-test";
process.env.USERS_TABLE = "Users-test";
process.env.AUDIT_TABLE = "Audit-test";
process.env.AWS_REGION = "us-east-1";

// A switchable stale price for the BR-6 test. It must be installed before trades.js is loaded,
// because trades.js keeps its own reference to getQuote.
const marketData = require("../backend/market-data");
const realGetQuote = marketData.getQuote;
let stalePrice = false;
marketData.getQuote = (symbol, now = Date.now()) => (stalePrice ? { priceCents: 18550, quotedAt: now - marketData.MAX_PRICE_AGE_MS - 1 } : realGetQuote(symbol, now));

const { handler } = require("../index");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");

const now = () => Math.floor(Date.now() / 1000);
const PLAYER = { sub: "r-1", email: "route@example.com", nickname: "Route Tester", iat: now() };

async function call(method, rawPath, body, { claims = PLAYER, routeKey, pathParameters, query } = {}) {
  const response = await handler({
    routeKey,
    rawPath,
    queryStringParameters: query,
    requestContext: { http: { method }, authorizer: claims ? { jwt: { claims } } : undefined },
    pathParameters,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.statusCode, headers: response.headers, body: response.body ? JSON.parse(response.body) : {} };
}

const order = (extra) => ({ symbol: "AAPL", tradeType: "Buy", quantity: 1, orderType: "Market", ...extra });
const tradeCount = () => fake.table(process.env.TABLE_NAME).size;
const cash = async (claims = PLAYER) => (await call("GET", "/api/account", undefined, { claims })).body.account.cashCents;

test("a POST to an unknown path is not a trade: 404, nothing saved, cash unchanged", async () => {
  const before = await cash();
  const count = tradeCount();
  for (const path of ["/api/tradez", "/api/games/00000000-0000-4000-8000-000000000000/foo", "/api/trades/extra/part", "/api/nothing"]) {
    const res = await call("POST", path, order());
    assert.strictEqual(res.status, 404, path);
    assert.deepStrictEqual(res.body, { success: false, reason: "Not found." }, path);
    assert.strictEqual(res.headers["Access-Control-Allow-Origin"], "*", path);
    assert.strictEqual(res.headers["Content-Type"], "application/json", path);
  }
  assert.strictEqual(tradeCount(), count);
  assert.strictEqual(await cash(), before);
});

test("an unknown GET path gets 404 instead of a trade lookup", async () => {
  for (const path of ["/api/nothing", "/api/tradez/abc", "/api/accounts"]) {
    const res = await call("GET", path);
    assert.strictEqual(res.status, 404, path);
    assert.strictEqual(res.body.reason, "Not found.", path);
  }
});

test("POST /api/trades still places a trade, with or without a trailing slash, by path or by route key", async () => {
  const before = await cash();
  const a = await call("POST", "/api/trades", order());
  const b = await call("POST", "/api/trades/", order());
  const c = await call("POST", "/api/trades", order(), { routeKey: "POST /api/trades" });
  for (const r of [a, b, c]) {
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.status, "ACCEPTED");
  }
  assert.strictEqual(await cash(), before - 3 * 18550);
});

test("the other routes still answer: list, one trade, account, quotes, profile, games, admin and learn", async () => {
  const saved = (await call("POST", "/api/trades", order())).body.transactionId;
  assert.strictEqual((await call("GET", "/api/trades")).status, 200);
  assert.strictEqual((await call("GET", "/api/trades/")).status, 200);
  assert.strictEqual((await call("GET", "/api/trades/" + saved, undefined, { pathParameters: { transactionId: saved } })).status, 200);
  assert.strictEqual((await call("GET", "/api/account")).status, 200);
  assert.strictEqual((await call("GET", "/api/quotes")).status, 200);
  assert.strictEqual((await call("GET", "/api/me")).status, 200);
  assert.strictEqual((await call("POST", "/api/games", { scenarioId: "crisis-2008" })).status, 201);
  assert.strictEqual((await call("GET", "/api/leaderboard", undefined, { query: { scenario: "crisis-2008" } })).status, 200);
  assert.strictEqual((await call("GET", "/api/admin/overview")).status, 403);
  assert.strictEqual((await call("GET", "/api/learn/questions", undefined, { claims: null })).status, 200);
  assert.strictEqual((await call("GET", "/api/nothing", undefined, { claims: null })).status, 401);
});

test("a wrong method on a trade route is 405 with status ERROR, not a trade rejection", async () => {
  const count = tradeCount();
  for (const [method, path] of [["PUT", "/api/trades"], ["DELETE", "/api/trades/00000000-0000-4000-8000-000000000000"], ["PATCH", "/api/account"], ["POST", "/api/quotes"]]) {
    const res = await call(method, path, order());
    assert.strictEqual(res.status, 405, method + " " + path);
    assert.strictEqual(res.body.status, "ERROR");
    assert.strictEqual(res.body.success, false);
    assert.match(res.body.reason, /Use POST \/api\/trades/);
  }
  assert.strictEqual(tradeCount(), count);
});

test("a confirmation number typed in capitals, or read through the catch-all route, finds the trade", async () => {
  const id = (await call("POST", "/api/trades", order())).body.transactionId;
  const upper = id.toUpperCase();
  const byParam = await call("GET", "/api/trades/" + upper, undefined, { pathParameters: { transactionId: upper } });
  assert.strictEqual(byParam.status, 200);
  assert.strictEqual(byParam.body.trade.transactionId, id);
  const byProxy = await call("GET", "/api/trades/" + id, undefined, { routeKey: "GET /api/{proxy+}", pathParameters: { proxy: "trades/" + id } });
  assert.strictEqual(byProxy.status, 200);
  assert.strictEqual(byProxy.body.trade.transactionId, id);
  const missing = await call("GET", "/api/trades/00000000-0000-4000-8000-000000000000");
  assert.strictEqual(missing.status, 404);
});

test("reads right after a write use ConsistentRead: the trade lookup, the retried order and the account", async () => {
  const send = DynamoDBDocumentClient.prototype.send;
  const gets = [];
  DynamoDBDocumentClient.prototype.send = function (command) {
    if (command instanceof GetCommand) gets.push(command.input);
    return send.call(this, command);
  };
  try {
    const requestId = "33333333-2222-4333-8444-555555555555";
    const first = await call("POST", "/api/trades", order({ requestId }));
    await call("POST", "/api/trades", order({ requestId })); // retry: existingReply reads the saved trade
    await call("GET", "/api/trades/" + first.body.transactionId);
  } finally {
    DynamoDBDocumentClient.prototype.send = send;
  }
  const trades = gets.filter((g) => g.TableName === process.env.TABLE_NAME);
  const accounts = gets.filter((g) => g.TableName === process.env.ACCOUNTS_TABLE);
  assert.ok(trades.length >= 2, "trade reads");
  assert.ok(accounts.length >= 2, "account reads");
  for (const g of [...trades, ...accounts]) assert.strictEqual(g.ConsistentRead, true, g.TableName);
});

test("Price unavailable (BR-6) is saved as a Rule rejection, and a retry returns the same record", async () => {
  const requestId = "44444444-2222-4333-8444-555555555555";
  stalePrice = true;
  let a, b;
  try {
    a = await call("POST", "/api/trades", order({ requestId }));
    b = await call("POST", "/api/trades", order({ requestId }));
  } finally {
    stalePrice = false;
  }
  assert.strictEqual(a.status, 400);
  assert.strictEqual(a.body.reason, "Price unavailable.");
  assert.strictEqual(a.body.trade.rejectionCategory, "Rule");
  assert.strictEqual(b.body.duplicate, true);
  assert.strictEqual(b.body.transactionId, a.body.transactionId);
});

test("a huge quantity gets 'Quantity is too large' and 1,000,000 is still checked normally", async () => {
  const huge = await call("POST", "/api/trades", order({ quantity: 1e20 }));
  assert.strictEqual(huge.status, 400);
  assert.strictEqual(huge.body.reason, "Quantity is too large. The maximum is 1,000,000 shares.");
  const max = await call("POST", "/api/trades", order({ quantity: 1000000 }));
  assert.strictEqual(max.body.reason, "Insufficient cash.");
});

test("a Cognito nickname that breaks the display-name rule is not used as the name", async () => {
  const bad = { sub: "evil-1", email: "evil@example.com", nickname: "=HYPERLINK(\"http://x\")", iat: now() };
  const me = await call("GET", "/api/me", undefined, { claims: bad });
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.body.user.name, "Player evil");
  const good = { sub: "good-1", email: "good@example.com", nickname: "  Ana   Lee ", iat: now() };
  assert.strictEqual((await call("GET", "/api/me", undefined, { claims: good })).body.user.name, "Ana Lee");
});
