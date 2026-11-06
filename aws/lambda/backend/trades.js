"use strict";
// MarketStreet Week 10: trade validation only (no order execution or saving).
const { PRICE_CENTS, START_CASH_CENTS, START_SHARES } = require("./market-data");

function reject(reason) {
  return { status: "REJECTED", reason, success: false, persisted: false };
}

function validateTrade(order) {
  if (!order || typeof order !== "object" || Array.isArray(order)) {
    return reject("A JSON trade object is required.");
  }

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
    return reject("Only Market orders are supported.");
  }

  // BR-3: quantity must be a real number that is a whole number of 1 or more
  // (a string like "2", null, 0.5, 0 and negatives are all rejected)
  if (typeof order.quantity !== "number" || !Number.isSafeInteger(order.quantity) || order.quantity < 1) {
    return reject("Quantity must be a positive whole number.");
  }

  // Cost in whole cents so the cash check has no floating point errors
  const totalCents = PRICE_CENTS[symbol] * order.quantity;

  if (order.tradeType === "Buy" && totalCents > START_CASH_CENTS) {
    return reject("Insufficient cash.");
  }

  const sharesOwned = START_SHARES[symbol] || 0;
  if (order.tradeType === "Sell" && order.quantity > sharesOwned) {
    return reject("Insufficient shares.");
  }

  return {
    status: "ACCEPTED",
    message: order.tradeType + " order accepted.",
    success: true,
    persisted: false
  };
}

module.exports = { validateTrade };
