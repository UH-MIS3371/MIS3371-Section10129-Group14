"use strict";
// Boundary table for the trade rules (BR-1 to BR-6, BR-9), like a Week-13 test table.
// Run: cd aws/lambda && npm test
const test = require("node:test");
const assert = require("node:assert");
const { validateOrder, checkAccount, validateTrade, TOO_LARGE } = require("../backend/trades");
const { MAX_PRICE_AGE_MS } = require("../backend/market-data");

const NOW = 1700000000000;
const PRICE = 18550;
const order = (extra) => ({ symbol: "AAPL", tradeType: "Buy", quantity: 1, orderType: "Market", ...extra });
const quoteAt = (quotedAt) => () => ({ priceCents: PRICE, quotedAt });
const QTY = "Quantity must be a positive whole number.";

const orderCases = [
  ["quantity 0", order({ quantity: 0 }), false, QTY],
  ["quantity 1", order({ quantity: 1 }), true],
  ["quantity 1.5", order({ quantity: 1.5 }), false, QTY],
  ['quantity "2"', order({ quantity: "2" }), false, QTY],
  ["quantity -1", order({ quantity: -1 }), false, QTY],
  ["quantity 1,000,000 (the maximum)", order({ quantity: 1000000 }), true],
  ["quantity 1,000,001", order({ quantity: 1000001 }), false, TOO_LARGE],
  ["quantity 1e20", order({ quantity: 1e20 }), false, TOO_LARGE],
  ["quantity 1000000.5", order({ quantity: 1000000.5 }), false, QTY],
  ["unknown symbol", order({ symbol: "XYZ" }), false, "Stock not found."],
  ["Limit order", order({ orderType: "Limit" }), false, "Limit orders are not supported."],
  ["trade type Hold", order({ tradeType: "Hold" }), false, "Trade type must be Buy or Sell."],
  ["quote exactly 15 minutes old", order(), true, undefined, quoteAt(NOW - MAX_PRICE_AGE_MS)],
  ["quote 15 minutes and 1 ms old", order(), false, "Price unavailable.", quoteAt(NOW - MAX_PRICE_AGE_MS - 1)]
];

for (const [name, o, success, reason, getQuote = quoteAt(NOW)] of orderCases) {
  test("validateOrder: " + name, () => {
    const r = validateOrder(o, { getQuote, now: NOW });
    assert.strictEqual(r.success, success);
    if (!success) assert.strictEqual(r.reason, reason);
  });
}

const accountCases = [
  ["Buy with cash exactly equal to cost", order(), { cashCents: PRICE, holdings: {} }, true],
  ["Buy with cash 1 cent short", order(), { cashCents: PRICE - 1, holdings: {} }, false, "Insufficient cash."],
  ["Sell exactly the shares owned", order({ tradeType: "Sell", quantity: 3 }), { cashCents: 0, holdings: { AAPL: 3 } }, true],
  ["Sell one more than owned", order({ tradeType: "Sell", quantity: 4 }), { cashCents: 0, holdings: { AAPL: 3 } }, false, "Insufficient shares."]
];

for (const [name, o, account, success, reason] of accountCases) {
  test("validateTrade: " + name, () => {
    const r = validateTrade(o, { getQuote: quoteAt(NOW), now: NOW, account });
    assert.strictEqual(r.success, success);
    if (!success) assert.strictEqual(r.reason, reason);
    const quote = validateOrder(o, { getQuote: quoteAt(NOW), now: NOW }).quote;
    assert.strictEqual(checkAccount(o, quote, account) === null, success);
  });
}
