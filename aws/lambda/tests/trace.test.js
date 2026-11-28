"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { ruleTrace, withTrace } = require("../backend/trace");

const statuses = (body) => ruleTrace(body).map((r) => r.status);

test("an accepted trade passed every rule", () => {
  assert.ok(statuses({ success: true }).every((s) => s === "Passed"));
});

test("a rejection fails at its rule, passes the ones before it and skips the ones after", () => {
  assert.deepStrictEqual(statuses({ success: false, reason: "Insufficient cash." }),
    ["Passed", "Passed", "Passed", "Passed", "Passed", "Passed", "Failed", "Not checked"]);
  assert.deepStrictEqual(statuses({ success: false, reason: "Stock not found." }),
    ["Passed", "Passed", "Failed", "Not checked", "Not checked", "Not checked", "Not checked", "Not checked"]);
  assert.strictEqual(ruleTrace({ success: false, reason: "Quantity must be a positive whole number." }).find((r) => r.status === "Failed").rule, "BR-3");
  assert.strictEqual(ruleTrace({ success: false, reason: "Quantity is too large. The maximum is 1,000,000 shares." }).find((r) => r.status === "Failed").rule, "BR-3");
});

test("the trace is added only when the request asks for it", () => {
  const res = { statusCode: 400, headers: {}, body: JSON.stringify({ success: false, reason: "Stock not found." }) };
  assert.strictEqual(withTrace({ body: JSON.stringify({ symbol: "X" }) }, res, Date.now()), res);
  const traced = JSON.parse(withTrace({ body: JSON.stringify({ trace: true }) }, res, Date.now() - 5).body);
  assert.strictEqual(traced.trace.length, 8);
  assert.ok(traced.serverMs >= 5);
  assert.strictEqual(traced.reason, "Stock not found.");
});
