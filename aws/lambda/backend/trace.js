"use strict";
// Opt-in explanation of a trade request for the demo page: which rules the server checked, in order, and what
// each one decided. Sent only when the request body has trace: true. It adds no new decisions; it reads the
// outcome the normal processing already produced (the checks stop at the first failure).
const RULES = [
  ["Request", "The request is well-formed JSON", ["A JSON request body is required.", "Request body must be valid JSON.", "requestId must be a UUID."]],
  ["BR-1", "Trade type is Buy or Sell", ["Trade type must be Buy or Sell."]],
  ["BR-2", "The stock symbol is supported", ["Stock not found."]],
  ["BR-9", "The order type is Market", ["Limit orders are not supported.", "Order type must be Market."]],
  ["BR-3", "Quantity is a positive whole number", ["Quantity must be a positive whole number."]],
  ["BR-6", "A valid price exists (no more than 15 minutes old)", ["Price unavailable."]],
  ["BR-4 / BR-5", "Enough cash for a Buy, or enough shares for a Sell", ["Insufficient cash.", "Insufficient shares."]],
  ["BR-7", "Trade record and account saved in one atomic commit", ["The trade could not be saved. Please try again."]]
];

// body is the parsed response of POST /api/trades
function ruleTrace(body) {
  const failed = body.success ? -1 : RULES.findIndex((r) => r[2].includes(body.reason));
  return RULES.map(([rule, name], i) => ({
    rule, name,
    status: body.success || i < failed ? "Passed" : i === failed ? "Failed" : "Not checked",
    detail: i === failed ? body.reason : undefined
  }));
}

// Adds trace and serverMs to a reply when the request asked for them; any other reply passes through unchanged
function withTrace(event, res, startedAt) {
  let wanted = false;
  try {
    const sent = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    wanted = Boolean(sent) && sent.trace === true;
  } catch (e) {
    wanted = false;
  }
  if (!wanted) return res;
  const body = JSON.parse(res.body);
  return { ...res, body: JSON.stringify({ ...body, trace: ruleTrace(body), serverMs: Date.now() - startedAt }) };
}

module.exports = { ruleTrace, withTrace };
