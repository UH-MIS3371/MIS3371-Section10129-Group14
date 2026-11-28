# Main Transaction

## TRANSACTION EVENT
#### User submits a simulated stock trade.

- ### TRIGGER
A signed-in user wants to buy or sell a stock through MarketStreet.

- ### INPUTS
Entered by the user: stock symbol, buy/sell action, and number of shares. The order type is Market (the only supported type, BR-9).  
Supplied by the application, not the user: user ID (from the signed-in session).

- ### SYSTEM ACTION
Verify the order, the stock price, and the user's available funds or holdings; execute the order at the simulated market price; and update the user's portfolio in one atomic commit (a DynamoDB conditional write that re-checks the cash or shares).

- ### OUTCOME
Complete the trade and update the virtual portfolio, or reject the order with a reason.

- ### OFFICIAL RECORD
Transaction ID, user ID, stock symbol, trade type, order type, shares, execution price, transaction value, status, rejection reason and category (if rejected), and timestamps. Full definitions are in the [data dictionary](../03-system-design/data-dictionary.md).

# BREAKDOWN

**User ID:**  
the system identifier of the signed-in user's simulated account (the Cognito user ID, a UUID); taken from the sign-in token, never typed by the user

**Number of shares:**  
the number of shares the user wants to buy or sell; must be a positive whole number

**Stock symbol:**  
the symbol used to identify a stock

**Buy/sell action:**  
whether the user is buying or selling the stock

**Order type:**  
Market; the trade executes at the current simulated price. Limit orders are out of scope.

**Execution price:**  
records the simulated price at which the trade was completed

**Transaction value:**  
records the total simulated value of the trade (shares × execution price)

**Timestamp:**  
records when the trade was submitted, validated, and completed

**Status:**  
describes where the trade is in processing: Submitted when the application receives the order, Validated when it passes all validation checks (BR-1 to BR-6, BR-9), and Accepted or Rejected when it finishes (Accepted and Rejected are final). Submitted and Validated are steps inside one Lambda call. Only the final status, Accepted or Rejected, is saved, in a single write (D-19). "Draft" describes an unsent form in the browser; it is not a status and is never saved.

# NOTES

**Input caught in the browser:**  
If the form has a missing field, an unrecognized symbol, or a quantity that is not a positive whole number (BR-1 to BR-3), it blocks submission and the user corrects the form. No transaction is created, so nothing is recorded.

**Input caught by the application:**  
Once the application receives an order, it assigns a transaction ID. The application re-checks BR-1 to BR-3 and BR-9, then checks BR-6 and BR-4 / BR-5. Any order that fails a rule is saved once, as Rejected with a reason and category `Rule`, and the user's cash and holdings stay unchanged. An accepted order is saved once, as Accepted, in the same DynamoDB transaction that changes the cash and holdings.
