"use strict";
// Simulated prices in cents. Copied from frontend/data.js (STOCKS), so the
// frontend and the Lambda support the same symbols. If a price changes in
// data.js, change it here too. The Lambda never uses the price sent by the browser.
const PRICE_CENTS = Object.freeze({
  "AAPL": 18550,
  "MSFT": 41230,
  "TSLA": 24810,
  "AMZN": 17825,
  "GOOGL": 16480,
  "NVDA": 12140,
  "IBM": 22110
});

// BR-6: a price is valid for at most 15 minutes after it was quoted
const MAX_PRICE_AGE_MS = 15 * 60 * 1000;

// Returns the current quote for a supported symbol: { priceCents, quotedAt } where
// quotedAt is a time in milliseconds. Simulated prices are always quoted "now".
// A live price provider can replace this function later; the rules in trades.js
// already check the price and its age.
function getQuote(symbol, now = Date.now()) {
  if (!Object.prototype.hasOwnProperty.call(PRICE_CENTS, symbol)) return null;
  return { priceCents: PRICE_CENTS[symbol], quotedAt: now };
}

// Starting account for a new user, same as START in frontend/app.js ($10,000 cash
// and 10 AAPL, 2 MSFT, 1 IBM). It is saved in the accounts table the first time the
// user trades; after that, every accepted trade updates the saved account (BR-7).
// The browser's cash and sharesOwned are never trusted.
const START_CASH_CENTS = 1000000;
const START_SHARES = Object.freeze({ "AAPL": 10, "MSFT": 2, "IBM": 1 });

module.exports = { PRICE_CENTS, MAX_PRICE_AGE_MS, getQuote, START_CASH_CENTS, START_SHARES };
