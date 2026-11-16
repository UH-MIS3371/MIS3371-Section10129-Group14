"use strict";
// Profiles, account settings, saved rejections and the admin console, through the real handler
// with DynamoDB replaced by the in-memory stand-in from local-server.js.
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

const { handler } = require("../index");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

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

const P2 = { sub: "p-2", email: "two@example.com", iat: now() };
const P3 = { sub: "p-3", email: "three@example.com", iat: now() };
const order = (extra) => ({ symbol: "AAPL", tradeType: "Buy", quantity: 1, orderType: "Market", ...extra });
const cash = async (claims) => (await call("GET", "/api/account", undefined, claims)).body.account.cashCents;

test("Rejected records are complete: completedAt always, price fields when a quote was obtained", async () => {
  const noQuote = (await call("POST", "/api/trades", order({ symbol: "XYZ" }), P2)).body.trade;
  assert.strictEqual(noQuote.completedAt, noQuote.validatedAt);
  assert.strictEqual(noQuote.executionPrice, undefined);
  const t = (await call("POST", "/api/trades", order({ quantity: 1000 }), P2)).body.trade;
  assert.strictEqual(t.rejectionReason, "Insufficient cash.");
  assert.strictEqual(t.completedAt, t.validatedAt);
  assert.strictEqual(t.executionPrice, 185.5);
  assert.strictEqual(t.transactionValue, 185500);
  assert.ok(Number.isFinite(Date.parse(t.priceTimestamp)));
});

test("a failed commit is recorded as a System rejection and answered with 500", async () => {
  fake.beforeCommit = async () => { throw new Error("commit failed"); };
  const res = await call("POST", "/api/trades", order(), P2);
  fake.beforeCommit = null;
  assert.strictEqual(res.status, 500);
  assert.strictEqual(res.body.status, "ERROR");
  assert.strictEqual(res.body.reason, "The trade could not be saved. Please try again.");
  assert.strictEqual(res.body.persisted, true);
  const saved = (await call("GET", "/api/trades/" + res.body.transactionId, undefined, P2)).body.trade;
  assert.strictEqual(saved.rejectionCategory, "System");
  assert.strictEqual(saved.status, "Rejected");
  fake.beforeCommit = async () => { fake.failNext = true; };
  const both = await call("POST", "/api/trades", order(), P2);
  fake.beforeCommit = null;
  fake.failNext = false;
  assert.strictEqual(both.status, 500);
  assert.strictEqual(both.body.persisted, false);
  assert.strictEqual(both.body.transactionId, undefined);
});

test("a retried requestId returns the first result and changes nothing (duplicate control)", async () => {
  const requestId = "11111111-2222-4333-8444-555555555555";
  const start = await cash(P3);
  const first = await call("POST", "/api/trades", order({ requestId, transactionId: "browser-chosen" }), P3);
  const second = await call("POST", "/api/trades", order({ requestId }), P3);
  assert.strictEqual(first.status, 200);
  assert.match(first.body.transactionId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.strictEqual(first.body.trade.requestId, requestId);
  assert.strictEqual(second.status, 200);
  assert.strictEqual(second.body.duplicate, true);
  assert.strictEqual(second.body.transactionId, first.body.transactionId);
  assert.strictEqual(await cash(P3), start - 18550);
  const mine = (await call("GET", "/api/trades", undefined, P3)).body.trades.filter((t) => t.requestId === requestId);
  assert.strictEqual(mine.length, 1);
});

test("a retried rejected order returns the saved rejection; other users get other IDs; bad requestId is a rule rejection", async () => {
  const requestId = "99999999-2222-4333-8444-555555555555";
  const a = await call("POST", "/api/trades", order({ requestId, quantity: 1000 }), P3);
  const b = await call("POST", "/api/trades", order({ requestId, quantity: 1000 }), P3);
  assert.strictEqual(b.status, 400);
  assert.strictEqual(b.body.duplicate, true);
  assert.strictEqual(b.body.transactionId, a.body.transactionId);
  const other = await call("POST", "/api/trades", order({ requestId }), P2);
  assert.notStrictEqual(other.body.transactionId, a.body.transactionId);
  const bad = await call("POST", "/api/trades", order({ requestId: "nope" }), P3);
  assert.strictEqual(bad.status, 400);
  assert.strictEqual(bad.body.reason, "requestId must be a UUID.");
  assert.strictEqual(bad.body.trade.rejectionCategory, "Rule");
});

test("an admin action is refused, and changes nothing, when its audit entry cannot be written", async () => {
  const before = await cash(P2);
  const send = DynamoDBDocumentClient.prototype.send;
  DynamoDBDocumentClient.prototype.send = function (command) {
    if (command instanceof PutCommand && command.input.TableName === process.env.AUDIT_TABLE) throw new Error("audit down");
    return send.call(this, command);
  };
  let res;
  try {
    res = await call("POST", "/api/admin/users/p-2/actions", { action: "adjust-cash", amountCents: 5000 }, ADMIN);
  } finally {
    DynamoDBDocumentClient.prototype.send = send;
  }
  assert.strictEqual(res.status, 500);
  assert.strictEqual(res.body.reason, "Nothing was changed. Please try again.");
  assert.strictEqual(await cash(P2), before);
});
