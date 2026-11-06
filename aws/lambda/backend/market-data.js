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

// Fixed starting account, same as START in frontend/app.js ($10,000 cash and
// 10 AAPL, 2 MSFT, 1 IBM). We use fixed values instead of trusting the browser's
// cash and sharesOwned, because anyone could edit those. Nothing is saved yet
// (no database), so the account never changes and every test starts the same.
const START_CASH_CENTS = 1000000;
const START_SHARES = Object.freeze({ "AAPL": 10, "MSFT": 2, "IBM": 1 });

module.exports = { PRICE_CENTS, START_CASH_CENTS, START_SHARES };
