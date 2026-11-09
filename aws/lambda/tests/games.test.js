"use strict";
// Scenario Mode tests: the shared rules (game-core.js) and the /api/games routes through the real handler,
// with DynamoDB replaced by the in-memory stand-in from local-server.js.
// Run: cd aws/lambda && npm test
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { installFakeDynamoDB } = require("../local-server");
const fake = installFakeDynamoDB();
process.env.TABLE_NAME = "Trades-test";
process.env.ACCOUNTS_TABLE = "Accounts-test";
process.env.GAMES_TABLE = "Games-test";
process.env.AWS_REGION = "us-east-1";

const { handler } = require("../index");
const core = require("../backend/game-core");
const SCENARIOS = require("../backend/scenario-data.json");
const crisis = SCENARIOS.find((s) => s.id === "crisis-2008");

// Signed-in users, as the claims API Gateway passes after checking a Cognito token
const PLAYER = { sub: "user-a", email: "a@example.com" };
const OTHER = { sub: "user-b", email: "b@example.com" };
const ADMIN = { sub: "user-admin", email: "admin@example.com", "cognito:groups": "[admins]" };

// Same shape as an API Gateway HTTP API (payload 2.0) event
async function call(method, rawPath, body, claims = PLAYER) {
  const gameId = (rawPath.match(/^\/api\/games\/([^/]+)/) || [])[1];
  const transactionId = (rawPath.match(/^\/api\/trades\/([^/]+)/) || [])[1];
  const response = await handler({
    rawPath,
    requestContext: { http: { method }, authorizer: claims ? { jwt: { claims } } : undefined },
    pathParameters: gameId ? { gameId } : transactionId ? { transactionId } : undefined,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : {} };
}

async function newGame() {
  const res = await call("POST", "/api/games", { scenarioId: "crisis-2008" });
  return res.body.game;
}

const order = (game, extra) => ({ requestId: crypto.randomUUID(), side: "Buy", symbol: "BAC", amountCents: 1000000, day: game.day, progress: 0, ...extra });

// ---------- Shared rules ----------

test("the browser and Lambda copies of the rules and prices are identical", () => {
  const backend = fs.readFileSync(path.join(__dirname, "../backend/game-core.js"), "utf8");
  const frontend = fs.readFileSync(path.join(__dirname, "../../../frontend/game-core.js"), "utf8");
  assert.strictEqual(frontend, backend, "run npm run sync-core");
  const page = fs.readFileSync(path.join(__dirname, "../../../frontend/data/scenarios.js"), "utf8");
  assert.deepStrictEqual(JSON.parse(page.slice(page.indexOf("["), page.lastIndexOf("]") + 1)), SCENARIOS);
});

test("replay prices are whole cents inside the day's real range and end on the real close", () => {
  for (const bar of crisis.stocks.BAC.bars.slice(crisis.start, crisis.start + 20)) {
    for (let p = 0; p <= 1; p += 0.1) {
      const cents = core.priceAt(bar, p);
      assert.ok(Number.isInteger(cents));
      assert.ok(cents >= Math.round(bar[2] * 100) && cents <= Math.round(bar[1] * 100));
    }
    assert.strictEqual(core.priceAt(bar, 1), Math.round(bar[3] * 100));
  }
});

test("order rules: whole shares, enough cash, one direction per stock, short limit", () => {
  const g = core.newGame(crisis);
  assert.match(core.placeOrder(crisis, g, "Buy", "BAC", 100).error, /at least/);
  assert.match(core.placeOrder(crisis, g, "Buy", "BAC", 20000000).error, /Not enough cash/);
  assert.ok(core.placeOrder(crisis, g, "Buy", "BAC", 1000000).trade);
  assert.match(core.placeOrder(crisis, g, "Short", "BAC", 1000000).error, /Close it/);
  assert.ok(core.placeOrder(crisis, g, "Short", "C", 500000).trade);
  assert.match(core.placeOrder(crisis, g, "Buy", "C", 100000).error, /short C/);
  assert.match(core.placeOrder(crisis, g, "Short", "GS", 30000000).error, /Short limit/);
  assert.strictEqual(core.totalValue(crisis, g), core.START_CASH);
});

test("closing half keeps the cost basis in proportion, closing all removes the position", () => {
  const g = core.newGame(crisis);
  core.placeOrder(crisis, g, "Buy", "BAC", 1000000);
  const shares = g.holdings.BAC;
  const basis = g.basis.BAC;
  core.closePosition(crisis, g, "BAC", 0.5);
  assert.strictEqual(g.holdings.BAC, shares - Math.floor(shares / 2));
  assert.strictEqual(g.basis.BAC, basis - Math.round((basis * Math.floor(shares / 2)) / shares));
  core.closePosition(crisis, g, "BAC", 1);
  assert.deepStrictEqual([g.holdings, g.basis], [{}, {}]);
  assert.strictEqual(g.cash, core.START_CASH);
});

test("a full 2008 game: the bot trades every close and sitting in cash earns no stars", () => {
  const g = core.newGame(crisis);
  while (g.status === "active") core.closeDay(crisis, g);
  assert.strictEqual(g.closes.length, crisis.dates.length - crisis.start - 1);
  assert.strictEqual(g.result.stars, 0);
  assert.strictEqual(g.result.botTrades, 150);
  assert.ok(Math.abs(g.result.bot - -0.3848) < 0.0005);
  assert.ok(Object.values(g.bot.holdings).every((q) => Number.isInteger(q) && q > 0) && g.bot.cash >= 0);
});

// ---------- /api/games ----------

test("starting a game: the server sets the ID, times, cash and day", async () => {
  const res = await call("POST", "/api/games", { scenarioId: "crisis-2008", cash: 99999999999, gameId: "mine" });
  assert.strictEqual(res.status, 201);
  const game = res.body.game;
  assert.match(game.gameId, /^[0-9a-f-]{36}$/);
  assert.strictEqual(game.cash, core.START_CASH);
  assert.strictEqual(game.day, crisis.start);
  assert.strictEqual(game.version, 1);
  assert.ok(game.createdAt && !("recentRequests" in game));
  assert.strictEqual((await call("POST", "/api/games", { scenarioId: "nope" })).status, 400);
});

test("an order is priced by the server, not the browser", async () => {
  const game = await newGame();
  const res = await call("POST", `/api/games/${game.gameId}/orders`, order(game, { progress: 0.5, price: 1 }));
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.trade.price, core.priceAt(crisis.stocks.BAC.bars[game.day], 0.5));
  assert.strictEqual(res.body.game.version, 2);
});

test("the same requestId twice saves one order (idempotency)", async () => {
  const game = await newGame();
  const body = order(game);
  const first = await call("POST", `/api/games/${game.gameId}/orders`, body);
  const second = await call("POST", `/api/games/${game.gameId}/orders`, body);
  assert.strictEqual(second.status, 200);
  assert.strictEqual(second.body.duplicate, true);
  assert.strictEqual(second.body.game.log.length, 1);
  assert.deepStrictEqual(second.body.game, first.body.game);
});

test("two different orders at the same moment are both kept (version check, no lost update)", async () => {
  const game = await newGame();
  const [a, b] = await Promise.all([
    call("POST", `/api/games/${game.gameId}/orders`, order(game)),
    call("POST", `/api/games/${game.gameId}/orders`, order(game, { symbol: "GS" }))
  ]);
  assert.deepStrictEqual([a.status, b.status], [200, 200]);
  const saved = (await call("GET", `/api/games/${game.gameId}`)).body.game;
  assert.strictEqual(saved.log.length, 2);
  assert.strictEqual(saved.version, 3);
});

test("orders must be for the current day; progress can't go backwards", async () => {
  const game = await newGame();
  assert.strictEqual((await call("POST", `/api/games/${game.gameId}/orders`, order(game, { day: game.day - 1 }))).status, 409);
  assert.strictEqual((await call("POST", `/api/games/${game.gameId}/orders`, order(game, { progress: 2 }))).status, 400);
  await call("POST", `/api/games/${game.gameId}/orders`, order(game, { progress: 0.6, amountCents: 100000 }));
  const later = await call("POST", `/api/games/${game.gameId}/orders`, order(game, { progress: 0.1, symbol: "GS" }));
  assert.strictEqual(later.body.game.progress, 0.6);
  assert.strictEqual(later.body.trade.price, core.priceAt(crisis.stocks.GS.bars[game.day], 0.6));
  assert.match((await call("POST", `/api/games/${game.gameId}/orders`, order(game, { side: "Short" }))).body.reason, /Close it/);
});

test("advance ends days, runs the bot, and finishes the game on the last day", async () => {
  const game = await newGame();
  const id = game.gameId;
  const wrong = await call("POST", `/api/games/${id}/advance`, { requestId: crypto.randomUUID(), day: game.day + 3 });
  assert.strictEqual(wrong.status, 409);
  const next = await call("POST", `/api/games/${id}/advance`, { requestId: crypto.randomUUID(), day: game.day });
  assert.strictEqual(next.body.game.day, game.day + 1);
  const jump = await call("POST", `/api/games/${id}/advance`, { requestId: crypto.randomUUID(), day: game.day + 1, untilDay: game.day + 10 });
  assert.strictEqual(jump.body.game.day, game.day + 10);
  assert.ok(jump.body.game.log.some((t) => t.who === "Bot"));
  const end = await call("POST", `/api/games/${id}/advance`, { requestId: crypto.randomUUID(), day: game.day + 10, untilDay: 99999 });
  assert.strictEqual(end.body.game.status, "over");
  assert.strictEqual(end.body.game.result.stars, 0);
  assert.strictEqual((await call("POST", `/api/games/${id}/orders`, order(end.body.game))).status, 409);
});

test("bad requests get clear errors", async () => {
  const game = await newGame();
  assert.strictEqual((await call("GET", "/api/games/not-a-uuid")).status, 404);
  assert.strictEqual((await call("GET", `/api/games/${crypto.randomUUID()}`)).status, 404);
  const noKey = await call("POST", `/api/games/${game.gameId}/orders`, { ...order(game), requestId: undefined });
  assert.deepStrictEqual([noKey.status, noKey.body.reason], [400, "A requestId is required."]);
  assert.strictEqual((await call("POST", `/api/games/${game.gameId}/close`, { requestId: crypto.randomUUID(), symbol: "BAC", day: game.day, progress: 0 })).status, 400);
});

test("a database failure says the action was NOT saved and leaks no internals", async () => {
  const game = await newGame();
  fake.failNext = true;
  const res = await call("POST", `/api/games/${game.gameId}/orders`, order(game));
  fake.failNext = false;
  assert.strictEqual(res.status, 500);
  assert.strictEqual(res.body.reason, "Your action was NOT saved. Please try again.");
  assert.ok(!JSON.stringify(res.body).includes("secret"));
  assert.strictEqual((await call("GET", `/api/games/${game.gameId}`)).body.game.log.length, 0);
});

test("the existing trade and account routes still answer", async () => {
  assert.strictEqual((await call("GET", "/api/account")).status, 200);
  assert.strictEqual((await call("POST", "/api/trades", {})).status, 400);
  assert.strictEqual((await call("OPTIONS", "/api/games")).status, 204);
});

// ---------- Sign-in and roles (Amazon Cognito) ----------

test("every route needs a signed-in user", async () => {
  for (const [method, route] of [["GET", "/api/account"], ["POST", "/api/trades"], ["POST", "/api/games"], ["GET", "/api/admin/games"]]) {
    const res = await call(method, route, {}, null);
    assert.deepStrictEqual([res.status, res.body.reason], [401, "Please sign in."]);
  }
});

test("each user has their own account", async () => {
  const a = (await call("GET", "/api/account")).body.account;
  const trade = await call("POST", "/api/trades", { symbol: "AAPL", tradeType: "Buy", quantity: 1, orderType: "Market", price: 185.5 });
  assert.strictEqual(trade.status, 200);
  assert.strictEqual(trade.body.trade.userId, PLAYER.sub);
  assert.ok((await call("GET", "/api/account")).body.account.cashCents < a.cashCents);
  assert.strictEqual((await call("GET", "/api/account", undefined, OTHER)).body.account.cashCents, a.cashCents);
  const path = "/api/trades/" + trade.body.transactionId;
  assert.strictEqual((await call("GET", path, undefined, OTHER)).status, 404);
  assert.strictEqual((await call("GET", path, undefined, ADMIN)).status, 200);
});

test("a game belongs to its player: others get 403, an admin may look but not play", async () => {
  const game = (await call("POST", "/api/games", { scenarioId: "crisis-2008", ownerId: "someone-else" })).body.game;
  assert.strictEqual(game.ownerId, PLAYER.sub);
  const path = `/api/games/${game.gameId}`;
  assert.strictEqual((await call("GET", path, undefined, OTHER)).status, 403);
  assert.strictEqual((await call("POST", path + "/orders", order(game), OTHER)).status, 403);
  assert.strictEqual((await call("GET", path, undefined, ADMIN)).status, 200);
  assert.strictEqual((await call("POST", path + "/orders", order(game), ADMIN)).status, 403);
});

test("only admins can list every game", async () => {
  assert.strictEqual((await call("GET", "/api/admin/games")).status, 403);
  const res = await call("GET", "/api/admin/games", undefined, ADMIN);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.games.length > 0 && res.body.games.every((g) => g.ownerEmail && !("log" in g)));
});
