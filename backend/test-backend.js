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

const tradeTests = [
    {
        // Valid trade
        symbol: "AAPL",
        tradeType: "Buy",
        quantity: 5,
        price: 200,
        cash: 5000,
        sharesOwned: 10
    },

    {
        // Invalid trade BR-3 Violated 
        symbol: "AAPL",
        tradeType: "Buy",
        quantity: 0.5,
        price: 200,
        cash: 5000,
        sharesOwned: 10
    },

    {
        // Invalid trade BR-4 Violated
        symbol: "AAPL",
        tradeType: "Sell",
        quantity: 15,
        price: 200,
        cash: 5000,
        sharesOwned: 10
    },

    {
        // Valid trade
        symbol: "AAPL",
        tradeType: "Sell",
        quantity: 5,
        price: 200,
        cash: 5000,
        sharesOwned: 10
    },

    {
        // Valid trade Edge Case: Total Price equals cash
        symbol: "AAPL",
        tradeType: "Buy",
        quantity: 5,
        price: 200,
        cash: 1000,
        sharesOwned: 10
    },

    {
        // Valid trade Edge Case: Quantity equals shares owned
        symbol: "AAPL",
        tradeType: "Sell",
        quantity: 10,
        price: 200,
        cash: 5000,
        sharesOwned: 10
    }

];

for (const trade of tradeTests) {
    console.log(processTrade(trade));
}

console.log("\n--- EXPECTED VS ACTUAL TEST RESULTS ---");

const expectedResults = [
    "ACCEPTED",
    "REJECTED",
    "REJECTED",
    "ACCEPTED",
    "ACCEPTED",
    "ACCEPTED"
];

tradeTests.forEach((trade, index) => {
    const actual = processTrade(trade).status;
    const expected = expectedResults[index];
    const result = actual === expected ? "PASS" : "FAIL";

    console.log(
        `Test ${index + 1}: Expected = ${expected}, Actual = ${actual}, Result = ${result}`
    );
});
