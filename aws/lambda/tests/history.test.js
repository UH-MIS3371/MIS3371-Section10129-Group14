"use strict";
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

const { handler } = require("../index");

const PLAYER = { sub: "h-1", email: "history@example.com", nickname: "History", iat: Math.floor(Date.now() / 1000) };

async function call(method, rawPath, body) {
  const response = await handler({
    rawPath: rawPath,
    requestContext: { http: { method }, authorizer: { jwt: { claims: PLAYER } } },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : {} };
}

const today = new Date().toISOString().slice(0, 10);

test("account value history keeps one point per day", async () => {
  const first = (await call("GET", "/api/me")).body.account.history;
  assert.deepStrictEqual(first, [{ date: today, valueCents: 1000000 }]);

  const trade = await call("POST", "/api/trades", { symbol: "AAPL", tradeType: "Buy", quantity: 1, orderType: "Market" });
  assert.strictEqual(trade.status, 200);
  assert.deepStrictEqual((await call("GET", "/api/me")).body.account.history, first);

  const table = fake.table(process.env.USERS_TABLE);
  const key = [...table.keys()].find((k) => k.includes(PLAYER.sub));
  const profile = table.get(key);
  table.set(key, { ...profile, valueHistory: { ...profile.valueHistory, "2020-01-01": 990000 } });
  const history = (await call("GET", "/api/me")).body.account.history;
  assert.deepStrictEqual(history.map((h) => h.date), ["2020-01-01", today]);
});
