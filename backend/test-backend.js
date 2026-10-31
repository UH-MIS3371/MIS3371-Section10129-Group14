const { processExpenses, processTrade } = require("./backend");

const tests = [
    {
        employeeId: "E001",
        expenseType: "Travel",
        amount: 500,
        date: "2023-10-01"
    },
    {
        employeeId: "E002",
        expenseType: "Meals",
        amount: 200,
        date: "2023-10-02"
    }
];

for (const test of tests) {
    processExpenses(test);
}
console.log("\n--- TRADE TESTS ---");

const order = (changes) => ({ symbol: "AAPL", tradeType: "Buy", quantity: 1, orderType: "Market", ...changes });
const NOW = Date.parse("2026-11-02T15:00:00Z");
const priceAged = (minutes) => ({ stocks: { AAPL: { priceCents: 18550, quotedAt: NOW - minutes * 60000 } }, now: NOW });

const tradeTests = [
    ["Valid Buy", order(), {}, "ACCEPTED", "Buy order accepted."],
    ["Valid Sell", order({ symbol: "MSFT", tradeType: "Sell", quantity: 2 }), {}, "ACCEPTED", "Sell order accepted."],
    ["BR-1 invalid trade type", order({ tradeType: "Hold" }), {}, "REJECTED", "Trade type must be Buy or Sell."],
    ["BR-2 unknown symbol", order({ symbol: "XYZQ" }), {}, "REJECTED", "Stock symbol is not supported."],
    ["BR-2 missing symbol", order({ symbol: undefined }), {}, "REJECTED", "Stock symbol is not supported."],
    ["BR-3 quantity 0", order({ quantity: 0 }), {}, "REJECTED", "Quantity must be a positive whole number."],
    ["BR-3 quantity 1.5", order({ quantity: 1.5 }), {}, "REJECTED", "Quantity must be a positive whole number."],
    ["BR-4 boundary: 53 AAPL affordable", order({ quantity: 53 }), {}, "ACCEPTED", "Buy order accepted."],
    ["BR-4 boundary: 54 AAPL too expensive", order({ quantity: 54 }), {}, "REJECTED", "Insufficient cash."],
    ["BR-4 exactly enough cash", order({ quantity: 5 }), { account: { cashCents: 92750, holdings: {} } }, "ACCEPTED", "Buy order accepted."],
    ["BR-4 one cent short", order({ quantity: 5 }), { account: { cashCents: 92749, holdings: {} } }, "REJECTED", "Insufficient cash."],
    ["BR-5 boundary: sell all 10 AAPL", order({ tradeType: "Sell", quantity: 10 }), {}, "ACCEPTED", "Sell order accepted."],
    ["BR-5 boundary: sell 11 AAPL", order({ tradeType: "Sell", quantity: 11 }), {}, "REJECTED", "Insufficient shares."],
    ["BR-5 sell stock not owned", order({ symbol: "TSLA", tradeType: "Sell" }), {}, "REJECTED", "Insufficient shares."],
    ["BR-6 price exactly 15 minutes old", order(), priceAged(15), "ACCEPTED", "Buy order accepted."],
    ["BR-6 price 16 minutes old", order(), priceAged(16), "REJECTED", "Price unavailable."],
    ["BR-6 price $0.00", order(), { stocks: { AAPL: { priceCents: 0 } } }, "REJECTED", "Price unavailable."],
    ["BR-9 Limit order", order({ orderType: "Limit" }), {}, "REJECTED", "Limit orders are not supported."],
    ["BR-9 missing order type", order({ orderType: undefined }), {}, "REJECTED", "Order type must be Market."],
    ["Tampered price ignored", order({ quantity: 1000000, price: 0.01 }), {}, "REJECTED", "Insufficient cash."],
    ["Tampered cash ignored", order({ quantity: 999, cash: 99999999 }), {}, "REJECTED", "Insufficient cash."],
    ["Tampered shares ignored", order({ tradeType: "Sell", quantity: 50, sharesOwned: 50 }), {}, "REJECTED", "Insufficient shares."]
];

let failed = 0;

for (const [name, trade, options, expectedStatus, expectedMessage] of tradeTests) {
    const result = processTrade(trade, options);
    const message = result.message || result.reason;
    const passed = result.status === expectedStatus && message === expectedMessage;

    console.log(`${passed ? "PASS" : "FAIL"}: ${name}${passed ? "" : ` (${result.status}: ${message})`}`);
    if (!passed) failed++;
}

console.log(`\nResults: ${tradeTests.length - failed}/${tradeTests.length} tests passed`);
if (failed > 0) process.exitCode = 1;
