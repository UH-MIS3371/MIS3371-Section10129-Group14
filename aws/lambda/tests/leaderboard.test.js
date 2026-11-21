"use strict";
const test = require("node:test");
const assert = require("node:assert");

const { installFakeDynamoDB } = require("../local-server");
installFakeDynamoDB();
process.env.TABLE_NAME = "Trades-test";
process.env.ACCOUNTS_TABLE = "Accounts-test";
process.env.GAMES_TABLE = "Games-test";
process.env.USERS_TABLE = "Users-test";
process.env.AUDIT_TABLE = "Audit-test";
process.env.AWS_REGION = "us-east-1";

const { handler } = require("../index");

const now = () => Math.floor(Date.now() / 1000);
const user = (n) => ({ sub: "u-" + n, email: "u" + n + "@example.com", nickname: "Player " + n, iat: now() });
const ADMIN = { sub: "a-1", email: "admin@example.com", "cognito:groups": "[admins]", iat: now() };

async function call(method, rawPath, body, claims) {
  const [path, query] = rawPath.split("?");
  const response = await handler({
    rawPath: path,
    queryStringParameters: query ? Object.fromEntries(new URLSearchParams(query)) : undefined,
    requestContext: { http: { method }, authorizer: { jwt: { claims } } },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : {} };
}

const board = (n) => call("GET", "/api/leaderboard?board=portfolio", undefined, user(n));

test("the portfolio board ranks players, hides emails and flags me", async () => {
  for (const n of [1, 2, 3]) await call("GET", "/api/me", undefined, user(n));
  await call("POST", "/api/admin/users/u-3/actions", { action: "adjust-cash", amountCents: 500000 }, ADMIN);
  await call("POST", "/api/admin/users/u-1/actions", { action: "adjust-cash", amountCents: -100000 }, ADMIN);
  const res = await board(1);
  assert.strictEqual(res.status, 200);
  const names = res.body.entries.filter((e) => e.name.startsWith("Player")).map((e) => e.name);
  assert.deepStrictEqual(names, ["Player 3", "Player 2", "Player 1"]);
  assert.deepStrictEqual(res.body.entries.map((e) => e.rank), res.body.entries.map((_, i) => i + 1));
  assert.ok(res.body.entries.find((e) => e.name === "Player 3").returnPct > 0);
  assert.strictEqual(res.body.entries.filter((e) => e.you).length, 1);
  assert.strictEqual(res.body.entries.find((e) => e.you).name, "Player 1");
  assert.ok(!/@|u-1|userId|email/.test(JSON.stringify(res.body)));
});

test("disabled players are excluded", async () => {
  assert.strictEqual((await call("POST", "/api/admin/users/u-3/actions", { action: "disable" }, ADMIN)).status, 200);
  const res = await board(1);
  assert.ok(!res.body.entries.some((e) => e.name === "Player 3"));
});
