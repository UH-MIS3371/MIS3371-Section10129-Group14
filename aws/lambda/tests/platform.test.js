"use strict";
// Profiles, account settings, saved rejections and the admin console, through the real handler
// with DynamoDB replaced by the in-memory stand-in from local-server.js.
// Run: cd aws/lambda && npm test
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
const PLAYER = { sub: "p-1", email: "player@example.com", nickname: "Player One", iat: now() };
const ADMIN = { sub: "a-1", email: "admin@example.com", "cognito:groups": "[admins]", iat: now() };

async function call(method, rawPath, body, claims = PLAYER) {
  const transactionId = (rawPath.match(/^\/api\/trades\/([^/?]+)/) || [])[1];
  const [path, query] = rawPath.split("?");
  const response = await handler({
    rawPath: path,
    queryStringParameters: query ? Object.fromEntries(new URLSearchParams(query)) : undefined,
    requestContext: { http: { method }, authorizer: claims ? { jwt: { claims } } : undefined },
    pathParameters: transactionId ? { transactionId } : undefined,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : {} };
}

const buy = (quantity, symbol = "AAPL") => call("POST", "/api/trades", { symbol, tradeType: "Buy", quantity, orderType: "Market" });

test("a new account starts with $10,000 and no holdings (D-10)", async () => {
  const me = await call("GET", "/api/me");
  assert.strictEqual(me.status, 200);
  assert.strictEqual(me.body.account.cashCents, 1000000);
  assert.deepStrictEqual(me.body.account.holdings, {});
  assert.strictEqual(me.body.user.name, "Player One");
  assert.strictEqual(me.body.user.isAdmin, false);
});

test("rejected trades are saved with a reason and category and change nothing (FR-4, BR-8)", async () => {
  const before = (await call("GET", "/api/account")).body.account;
  const res = await call("POST", "/api/trades", { symbol: "AAPL", tradeType: "Sell", quantity: 5, orderType: "Market" });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.status, "REJECTED");
  assert.strictEqual(res.body.persisted, true);
  assert.strictEqual(res.body.trade.rejectionReason, "Insufficient shares.");
  assert.strictEqual(res.body.trade.rejectionCategory, "Rule");
  assert.deepStrictEqual((await call("GET", "/api/account")).body.account, before);
  const found = await call("GET", "/api/trades/" + res.body.transactionId);
  assert.strictEqual(found.body.trade.status, "Rejected");
});

test("GET /api/trades lists only my trades, newest first, Accepted and Rejected (FR-6)", async () => {
  await buy(1);
  await call("POST", "/api/trades", { symbol: "XYZ", tradeType: "Buy", quantity: 1, orderType: "Market" }, ADMIN);
  const list = (await call("GET", "/api/trades")).body.trades;
  assert.ok(list.length >= 2);
  assert.ok(list.every((t) => t.userId === PLAYER.sub));
  assert.ok(list.some((t) => t.status === "Accepted") && list.some((t) => t.status === "Rejected"));
  assert.ok(list[0].submittedAt >= list[list.length - 1].submittedAt);
});

test("a player can rename themselves; bad names are refused", async () => {
  assert.strictEqual((await call("PATCH", "/api/me", { name: "<b>" })).status, 400);
  const res = await call("PATCH", "/api/me", { name: "  Diamond   Hands " });
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await call("GET", "/api/me")).body.user.name, "Diamond Hands");
});

test("resetting my account needs RESET and keeps the trade records (NFR-4)", async () => {
  const trades = (await call("GET", "/api/trades")).body.trades.length;
  assert.strictEqual((await call("POST", "/api/account/reset", { confirm: "reset" })).status, 400);
  const res = await call("POST", "/api/account/reset", { confirm: "RESET" });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body.account, { cashCents: 1000000, holdings: {} });
  assert.strictEqual((await call("GET", "/api/trades")).body.trades.length, trades);
});

test("non-admins get 403 on every admin route, and the refusal is audited", async () => {
  for (const path of ["/api/admin/overview", "/api/admin/users", "/api/admin/trades", "/api/admin/audit", "/api/admin/games"]) {
    assert.strictEqual((await call("GET", path)).status, 403, path);
  }
  assert.strictEqual((await call("POST", "/api/admin/users/a-1/actions", { action: "make-admin" })).status, 403);
  const log = (await call("GET", "/api/admin/audit", undefined, ADMIN)).body.entries;
  assert.ok(log.some((e) => e.action === "authz.denied" && e.actorId === PLAYER.sub));
});

test("the admin overview, user list and user detail show platform data", async () => {
  const overview = (await call("GET", "/api/admin/overview", undefined, ADMIN)).body;
  assert.ok(overview.kpis.users >= 2);
  assert.strictEqual(overview.tradesByDay.length, 14);
  assert.ok(overview.rejectionReasons.some((r) => r.label === "Insufficient shares."));
  const users = (await call("GET", "/api/admin/users", undefined, ADMIN)).body.users;
  const player = users.find((u) => u.userId === PLAYER.sub);
  assert.strictEqual(player.email, PLAYER.email);
  const detail = (await call("GET", "/api/admin/users/p-1", undefined, ADMIN)).body;
  assert.ok(detail.trades.length >= 2);
  assert.ok(detail.audit.some((e) => e.action === "account.reset"));
  assert.strictEqual((await call("GET", "/api/admin/users/nobody", undefined, ADMIN)).status, 404);
});

test("admins can adjust cash and reset an account; both are audited", async () => {
  const act = (body) => call("POST", "/api/admin/users/p-1/actions", body, ADMIN);
  assert.strictEqual((await act({ action: "adjust-cash", amountCents: -99999999 })).status, 400);
  assert.strictEqual((await act({ action: "adjust-cash", amountCents: 50000, reason: "Prize" })).status, 200);
  assert.strictEqual((await call("GET", "/api/account")).body.account.cashCents, 1050000);
  assert.strictEqual((await act({ action: "reset-account", confirm: "wrong" })).status, 400);
  assert.strictEqual((await act({ action: "reset-account", confirm: PLAYER.email })).status, 200);
  const log = (await call("GET", "/api/admin/audit", undefined, ADMIN)).body.entries;
  const adjust = log.find((e) => e.action === "account.cash_adjust");
  assert.deepStrictEqual([adjust.before.cashCents, adjust.after.cashCents, adjust.reason], [1000000, 1050000, "Prize"]);
});

test("a disabled user is refused until enabled again", async () => {
  const act = (body, claims = ADMIN) => call("POST", "/api/admin/users/p-1/actions", body, claims);
  assert.strictEqual((await act({ action: "disable" })).status, 200);
  assert.strictEqual((await call("GET", "/api/me")).status, 403);
  assert.strictEqual((await act({ action: "enable" })).status, 200);
  assert.strictEqual((await call("GET", "/api/me")).status, 200);
});

test("admins can promote and demote, but not demote or disable themselves or remove the last admin", async () => {
  const act = (id, body) => call("POST", "/api/admin/users/" + id + "/actions", body, ADMIN);
  assert.strictEqual((await act("a-1", { action: "remove-admin" })).status, 400);
  assert.strictEqual((await act("a-1", { action: "disable" })).status, 400);
  assert.strictEqual((await act("p-1", { action: "make-admin" })).status, 200);
  assert.strictEqual((await call("GET", "/api/admin/overview")).status, 200); // the player is now an admin
  assert.strictEqual((await act("p-1", { action: "remove-admin" })).status, 200);
  assert.strictEqual((await call("GET", "/api/admin/overview")).status, 403);
});

test("signing out everywhere rejects tokens issued before it", async () => {
  const old = { ...PLAYER, iat: now() - 60 };
  assert.strictEqual((await call("POST", "/api/me/sign-out-everywhere", undefined, old)).status, 200);
  assert.strictEqual((await call("GET", "/api/me", undefined, old)).status, 401);
  assert.strictEqual((await call("GET", "/api/me", undefined, { ...PLAYER, iat: now() + 1 })).status, 200);
});
