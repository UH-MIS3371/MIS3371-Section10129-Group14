"use strict";
// MarketStreet trade validation. validateOrder checks the order itself (BR-1 to BR-3,
// BR-6, BR-9); checkAccount checks it against an account (BR-4, BR-5). Saving and the
// account update happen in accounts.js, which re-checks cash and shares in the same commit.
const { PRICE_CENTS, MAX_PRICE_AGE_MS, getQuote, START_CASH_CENTS, START_SHARES } = require("./market-data");

function reject(reason) {
  return { status: "REJECTED", reason, success: false, persisted: false };
}

// options.getQuote and options.now can be replaced in tests (for example, an old price)
function validateOrder(order, options = {}) {
  const quoteFor = options.getQuote || getQuote;
  const now = options.now === undefined ? Date.now() : options.now;

  if (!order || typeof order !== "object" || Array.isArray(order)) {
    return reject("A JSON trade object is required.");
  }

  // BR-1: Buy or Sell only
  if (order.tradeType !== "Buy" && order.tradeType !== "Sell") {
    return reject("Trade type must be Buy or Sell.");
  }

  // BR-2: trim and uppercase the symbol, then check our own price list
  const symbol = typeof order.symbol === "string" ? order.symbol.trim().toUpperCase() : "";
  if (!Object.prototype.hasOwnProperty.call(PRICE_CENTS, symbol)) {
    return reject("Stock not found.");
  }

  // BR-9: market orders only
  if (order.orderType !== "Market") {
    return reject(order.orderType === "Limit" ? "Limit orders are not supported." : "Order type must be Market.");
  }

  // BR-3: quantity must be a real number that is a whole number of 1 or more
  // (a string like "2", null, 0.5, 0 and negatives are all rejected)
  if (typeof order.quantity !== "number" || !Number.isSafeInteger(order.quantity) || order.quantity < 1) {
    return reject("Quantity must be a positive whole number.");
  }

  // BR-6: the price must be a whole number of cents above $0 (so at most two
  // decimals) and quoted no more than 15 minutes ago. It is fetched once here
  // and the trade executes at exactly this price.
  const quote = quoteFor(symbol, now);
  if (!quote || !Number.isSafeInteger(quote.priceCents) || quote.priceCents <= 0 ||
      typeof quote.quotedAt !== "number" || !Number.isFinite(quote.quotedAt) || now - quote.quotedAt > MAX_PRICE_AGE_MS) {
    return reject("Price unavailable.");
  }

  return {
    status: "ACCEPTED",
    message: order.tradeType + " order accepted.",
    success: true,
    persisted: false,
    // Used by index.js to build the saved record; not sent to the browser as-is
    quote: { symbol, priceCents: quote.priceCents, quotedAt: quote.quotedAt }
  };
}

// BR-4 and BR-5 against an account { cashCents, holdings }. Amounts are whole cents
// so "exactly enough cash" compares correctly.
function checkAccount(order, quote, account) {
  const totalCents = quote.priceCents * order.quantity;
  if (order.tradeType === "Buy" && totalCents > account.cashCents) {
    return reject("Insufficient cash.");
  }
  const sharesOwned = (account.holdings && account.holdings[quote.symbol]) || 0;
  if (order.tradeType === "Sell" && order.quantity > sharesOwned) {
    return reject("Insufficient shares.");
  }
  return null;
}

// Both checks together. Without options.account it uses the starting account.
function validateTrade(order, options = {}) {
  const result = validateOrder(order, options);
  if (!result.success) return result;
  const account = options.account || { cashCents: START_CASH_CENTS, holdings: START_SHARES };
  return checkAccount(order, result.quote, account) || result;
}

module.exports = { validateOrder, checkAccount, validateTrade, reject };
