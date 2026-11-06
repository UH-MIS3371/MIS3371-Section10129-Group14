const processExpenses = (expense) => {
    // Validate the expense object
    if (!expense.employeeId || !expense.expenseType || !expense.amount || !expense.date) {
        throw new Error("Invalid expense object");
    }
    
    console.log(`Processing expense for employee ${expense.employeeId}: ${expense.expenseType} - $${expense.amount} on ${expense.date}`);
}

// Prices and the demo account live on the backend, in whole cents, so a request
// can never choose its own price, cash, or shares (BR-9). Prices must match frontend/data.js.
const STOCKS = {
    AAPL: { priceCents: 18550 },
    MSFT: { priceCents: 41230 },
    TSLA: { priceCents: 24810 },
    AMZN: { priceCents: 17825 },
    GOOGL: { priceCents: 16480 },
    NVDA: { priceCents: 12140 },
    IBM: { priceCents: 22110 }
};

const DEMO_ACCOUNT = {
    cashCents: 1000000,
    holdings: { AAPL: 10, MSFT: 2, IBM: 1 }
};

const MAX_PRICE_AGE_MS = 15 * 60 * 1000;

const reject = (reason) => ({ status: "REJECTED", reason });

const processTrade = (order, { stocks = STOCKS, account = DEMO_ACCOUNT, now = Date.now() } = {}) => {
    const trade = order || {};
    const symbol = typeof trade.symbol === "string" ? trade.symbol.trim().toUpperCase() : "";

    // BR-1: Trade type must be Buy or Sell
    if (trade.tradeType !== "Buy" && trade.tradeType !== "Sell") {
        return reject("Trade type must be Buy or Sell.");
    }

    // BR-2: Stock symbol must be recognized
    const stock = stocks[symbol];
    if (!stock) {
        return reject("Stock symbol is not supported.");
    }

    // BR-3: Quantity must be a positive whole number
    if (!Number.isInteger(trade.quantity) || trade.quantity <= 0) {
        return reject("Quantity must be a positive whole number.");
    }

    // BR-9: Only Market orders are executed
    if (trade.orderType !== "Market") {
        return reject(trade.orderType === "Limit" ? "Limit orders are not supported." : "Order type must be Market.");
    }

    // BR-6: A valid price is greater than $0 and no more than 15 minutes old
    const quotedAt = stock.quotedAt === undefined ? now : stock.quotedAt;
    if (!(stock.priceCents > 0) || now - quotedAt > MAX_PRICE_AGE_MS) {
        return reject("Price unavailable.");
    }

    // BR-4: Buy orders must have enough cash
    if (trade.tradeType === "Buy") {
        if (trade.quantity * stock.priceCents > account.cashCents) {
            return reject("Insufficient cash.");
        }

        return { status: "ACCEPTED", message: "Buy order accepted." };
    }

    // BR-5: Sell orders must have enough shares
    if (trade.quantity > (account.holdings[symbol] || 0)) {
        return reject("Insufficient shares.");
    }

    return { status: "ACCEPTED", message: "Sell order accepted." };
};

module.exports = { processExpenses, processTrade };