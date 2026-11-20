"use strict";
// Guest mode (frontend/guest.js) must follow the same trading rules as the real backend, and must never touch
// the network. The same orders go to both and the answers are compared.
// Run: cd aws/lambda && npm test
const test = require("node:test");
const assert = require("node:assert");

// A stand-in for the browser's sessionStorage, and a fetch that fails the test if guest mode ever uses it
const store = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};
let networkCalls = 0;
globalThis.fetch = () => {
  networkCalls++;
  throw new Error("Guest mode must not use the network.");
};

const guest = require("../../../frontend/guest");
const { validateTrade } = require("../backend/trades");
const { ruleTrace } = require("../backend/trace");
const { PRICE_CENTS } = require("../backend/market-data");
guest.setDelay(0);

const reset = () => { store.clear(); guest.reset(); };
async function call(method, path, body) {
  const response = await guestRespond("https://example.invalid/api" + path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, ok: response.ok, data: await response.json() };
}
const order = (o = {}) => ({ symbol: "AAPL", tradeType: "Buy", quantity: 1, orderType: "Market", ...o });

test("guest prices match the server's price list", () => {
  assert.deepStrictEqual(guest.PRICE_CENTS, { ...PRICE_CENTS });
});

test("guest and server agree on every order that breaks a rule, or none", async () => {
  const orders = [
    order(), order({ quantity: 53 }), order({ quantity: 54 }), order({ quantity: 0 }), order({ quantity: 0.5 }), order({ quantity: -3 }),
    order({ quantity: "2" }), order({ quantity: null }), order({ quantity: 1e21 }), order({ symbol: "XYZ" }), order({ symbol: " msft " }),
    order({ symbol: 5 }), order({ tradeType: "Hold" }), order({ tradeType: "buy" }), order({ orderType: "Limit" }), order({ orderType: "Stop" }),
    order({ orderType: undefined }), order({ tradeType: "Sell" }), order({ tradeType: "Sell", symbol: "TSLA", quantity: 5 })
  ];
  for (const o of orders) {
    reset();
    const server = validateTrade(o);
    const { data, status } = await call("POST", "/trades", o);
    assert.strictEqual(data.success, server.success, JSON.stringify(o));
    assert.strictEqual(data.status, server.status, JSON.stringify(o));
    assert.strictEqual(data.reason, server.reason, JSON.stringify(o));
    assert.strictEqual(status, server.success ? 200 : 400);
  }
});

test("guest sells follow the same share rule as the server after a buy", async () => {
  reset();
  const bought = await call("POST", "/trades", order({ quantity: 10 }));
  assert.strictEqual(bought.data.status, "ACCEPTED");
  const account = { cashCents: bought.data.account.cashCents, holdings: bought.data.account.holdings };
  for (const quantity of [1, 10, 11]) {
    const o = order({ tradeType: "Sell", quantity });
    const server = validateTrade(o, { account });
    const { data } = await call("POST", "/trades", o);
    assert.strictEqual(data.reason, server.reason, "sell " + quantity);
    assert.strictEqual(data.success, server.success, "sell " + quantity);
    if (data.success) {
      const again = await call("POST", "/trades", order({ tradeType: "Sell", quantity: 1 }));
      assert.strictEqual(again.data.success, quantity !== 10, "after selling " + quantity);
      break;
    }
  }
});

test("a buy changes cash and holdings exactly, in cents", async () => {
  reset();
  const { data } = await call("POST", "/trades", order({ symbol: "MSFT", quantity: 2 }));
  assert.strictEqual(data.account.cashCents, 1000000 - 41230 * 2);
  assert.deepStrictEqual(data.account.holdings, { MSFT: 2 });
  assert.strictEqual(data.trade.executionPrice, 412.3);
  assert.strictEqual(data.trade.transactionValue, 824.6);
  assert.match(data.transactionId, /^[0-9a-f-]{36}$/);
  assert.strictEqual(data.persisted, true);
});

test("the demo's rule table matches the server's for the same orders", async () => {
  for (const o of [order(), order({ quantity: 0 }), order({ tradeType: "Sell", quantity: 5 }), order({ quantity: 999, symbol: "IBM" }), order({ symbol: "XYZ" })]) {
    reset();
    const { data } = await call("POST", "/trades", { ...o, trace: true });
    const body = { success: data.success, reason: data.reason };
    assert.deepStrictEqual(data.trace, JSON.parse(JSON.stringify(ruleTrace(body))), JSON.stringify(o)); // as sent over JSON
    assert.strictEqual(data.serverMs, undefined, "there is no Lambda to time");
  }
});

test("rejected orders are kept with their reason, and a retried requestId does not trade twice", async () => {
  reset();
  const requestId = "11111111-2222-4333-8444-555555555555";
  const first = await call("POST", "/trades", order({ requestId }));
  const again = await call("POST", "/trades", order({ requestId }));
  assert.strictEqual(again.data.transactionId, first.data.transactionId);
  assert.strictEqual(again.data.duplicate, true);
  await call("POST", "/trades", order({ quantity: 0 }));
  const { data } = await call("GET", "/trades");
  assert.strictEqual(data.trades.length, 2);
  assert.strictEqual(data.trades[0].status, "Rejected");
  assert.strictEqual(data.trades[0].rejectionReason, "Quantity must be a positive whole number.");
  assert.strictEqual((await call("GET", "/me")).data.account.cashCents, 1000000 - 18550);
});

test("a bad requestId and a bad body are refused like the server refuses them", async () => {
  reset();
  assert.strictEqual((await call("POST", "/trades", order({ requestId: "nope" }))).data.reason, "requestId must be a UUID.");
  const response = await guestRespond("/api/trades", { method: "POST", body: "{not json" });
  assert.strictEqual((await response.json()).reason, "Request body must be valid JSON.");
  const empty = await guestRespond("/api/trades", { method: "POST", body: "" });
  assert.strictEqual((await empty.json()).reason, "A JSON request body is required.");
});

test("looking up a trade: found for the guest's own, 404 for anything else", async () => {
  reset();
  const { data } = await call("POST", "/trades", order());
  const found = await call("GET", "/trades/" + data.transactionId);
  assert.strictEqual(found.status, 200);
  assert.strictEqual(found.data.trade.transactionId, data.transactionId);
  for (const id of ["11111111-1111-4111-8111-111111111111", "not-a-real-id"]) {
    const missing = await call("GET", "/trades/" + id);
    assert.strictEqual(missing.status, 404);
    assert.strictEqual(missing.data.reason, "Trade not found.");
  }
});

test("profile: starts at $10,000, renames with the server's rule, resets only when confirmed", async () => {
  reset();
  const me = (await call("GET", "/me")).data;
  assert.strictEqual(me.account.cashCents, 1000000);
  assert.strictEqual(me.user.isAdmin, false);
  assert.strictEqual((await call("PATCH", "/me", { name: "ab" })).status, 400);
  assert.strictEqual((await call("PATCH", "/me", { name: "Guest Trader" })).data.name, "Guest Trader");
  assert.strictEqual((await call("GET", "/me")).data.user.name, "Guest Trader");
  await call("POST", "/trades", order({ quantity: 3 }));
  assert.strictEqual((await call("POST", "/account/reset", { confirm: "nope" })).status, 400);
  const reset2 = await call("POST", "/account/reset", { confirm: "RESET" });
  assert.deepStrictEqual(reset2.data.account, { cashCents: 1000000, holdings: {} });
  assert.strictEqual((await call("GET", "/trades")).data.trades.length, 1, "trade records are kept after a reset");
  const stats = (await call("GET", "/me")).data.stats;
  assert.deepStrictEqual([stats.trades, stats.rejected, stats.games], [1, 0, 0]);
});

test("quotes cover every supported stock", async () => {
  const { data } = await call("GET", "/quotes");
  assert.deepStrictEqual(Object.keys(data.quotes).sort(), Object.keys(PRICE_CENTS).sort());
  assert.strictEqual(data.quotes.AAPL.priceCents, 18550);
});

test("Scenario Mode and admin need a real account; leaderboards are empty for guests", async () => {
  reset();
  const game = await call("POST", "/games", { scenarioId: "x" });
  assert.strictEqual(game.status, 403);
  assert.match(game.data.reason, /create a free account/i);
  assert.strictEqual((await call("GET", "/admin/users")).status, 403);
  assert.deepStrictEqual((await call("GET", "/leaderboard?board=portfolio")).data.entries, []);
  assert.deepStrictEqual((await call("GET", "/leaderboard?scenario=covid")).data.entries, []);
});

test("a guest's account is kept per tab and never shared", async () => {
  reset();
  await call("POST", "/trades", order({ quantity: 2 }));
  assert.ok(store.has("marketstreet-guest-state"), "the account is kept in sessionStorage");
  guest.reset(); // as after a page reload: only sessionStorage remains
  assert.strictEqual((await call("GET", "/me")).data.account.cashCents, 1000000 - 18550 * 2);
  store.clear(); // as after the tab closes: a new page starts with nothing in memory either
  guest.reset();
  assert.strictEqual((await call("GET", "/me")).data.account.cashCents, 1000000);
});

test("guest mode made no network calls at all", () => {
  assert.strictEqual(networkCalls, 0);
});
