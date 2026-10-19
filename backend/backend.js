const processExpenses = (expense) => {
    // Validate the expense object
    if (!expense.employeeId || !expense.expenseType || !expense.amount || !expense.date) {
        throw new Error("Invalid expense object");
    }
    
    console.log(`Processing expense for employee ${expense.employeeId}: ${expense.expenseType} - $${expense.amount} on ${expense.date}`);
}

const processTrade = (trade) => {
    // BR-1: Trade type must be Buy or Sell
    if (trade.tradeType !== "Buy" && trade.tradeType !== "Sell") {
        return {
            status: "REJECTED",
            reason: "Trade type must be Buy or Sell."
        };
    }

    // BR-3: Quantity must be a positive whole number
    if (!Number.isInteger(trade.quantity) || trade.quantity <= 0) {
        return {
            status: "REJECTED",
            reason: "Quantity must be a positive whole number."
        };
    }

    // BR-4: Buy orders must have enough cash
    if (trade.tradeType === "Buy") {
        const totalCost = trade.quantity * trade.price;

        if (totalCost > trade.cash) {
            return {
                status: "REJECTED",
                reason: "Insufficient cash."
            };
        }

        return {
            status: "ACCEPTED",
            message: "Buy order accepted."
        };
    }

    // BR-5: Sell orders must have enough shares
    if (trade.tradeType === "Sell") {
        if (trade.quantity > trade.sharesOwned) {
            return {
                status: "REJECTED",
                reason: "Insufficient shares."
            };
        }

        return {
            status: "ACCEPTED",
            message: "Sell order accepted."
        };
    }
};
module.exports = { processExpenses, processTrade };