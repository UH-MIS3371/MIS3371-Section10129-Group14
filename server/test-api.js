/*
  MarketStreet — Week 9 API Integration Tests
  Tests the Express API independently of the browser.
  Uses the existing Week 8 processTrade() business rules.
*/

const API_URL = "http://localhost:3000/api/trades";

// Starting account information for our simulated tests
const baseTrade = {
  symbol: "AAPL",
  tradeType: "Buy",
  quantity: 1,
  orderType: "Market",
  price: 185.50,
  cash: 10000,
  sharesOwned: 10
};

// Six test cases: valid, invalid, and boundary conditions
const tests = [
  {
    name: "Valid Buy - 1 share",
    changes: { quantity: 1 },
    expectedCode: 200,
    expectedStatus: "ACCEPTED",
    expectedMessage: "Buy order accepted."
  },
  {
    name: "Invalid Quantity - 0.5 shares",
    changes: { quantity: 0.5 },
    expectedCode: 400,
    expectedStatus: "REJECTED",
    expectedMessage: "Quantity must be a positive whole number."
  },
  {
    name: "Valid Sell Boundary - 10 shares owned",
    changes: { tradeType: "Sell", quantity: 10 },
    expectedCode: 200,
    expectedStatus: "ACCEPTED",
    expectedMessage: "Sell order accepted."
  },
  {
    name: "Invalid Sell - 11 shares, only 10 owned",
    changes: { tradeType: "Sell", quantity: 11 },
    expectedCode: 400,
    expectedStatus: "REJECTED",
    expectedMessage: "Insufficient shares."
  },
  {
    name: "Valid Buy Boundary - 53 affordable shares",
    changes: { quantity: 53 },
    expectedCode: 200,
    expectedStatus: "ACCEPTED",
    expectedMessage: "Buy order accepted."
  },
  {
    name: "Invalid Buy Boundary - 54 unaffordable shares",
    changes: { quantity: 54 },
    expectedCode: 400,
    expectedStatus: "REJECTED",
    expectedMessage: "Insufficient cash."
  }
];

// Run each test against the actual local Express endpoint
async function runTests() {
  let passed = 0;

  for (const test of tests) {
    const trade = { ...baseTrade, ...test.changes };

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(trade)
    });

    const result = await response.json();
    const actualMessage = result.message || result.reason;

    const success =
      response.status === test.expectedCode &&
      result.status === test.expectedStatus &&
      actualMessage === test.expectedMessage;

    console.log(`\n${success ? "PASS" : "FAIL"}: ${test.name}`);
    console.log(`Expected: ${test.expectedCode}, ${test.expectedStatus}, ${test.expectedMessage}`);
    console.log(`Actual:   ${response.status}, ${result.status}, ${actualMessage}`);

    if (success) passed++;
  }

  console.log(`\nResults: ${passed}/${tests.length} tests passed`);

  if (passed !== tests.length) {
    process.exitCode = 1;
  }
}

runTests().catch((error) => {
  console.error("API test failed. Make sure the local server is running.");
  console.error(error.message);
  process.exitCode = 1;
});