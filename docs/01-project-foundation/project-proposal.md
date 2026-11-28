# Project Proposal

## MarketStreet — Paper Trading System

> MIS 3371 • Reference-based project proposal for the MarketStreet capstone.

## 1. Proposed System

MarketStreet is a web-based **paper trading system** where users can practice buying and selling stocks using simulated money. No real money or securities are traded.

The system focuses on one primary transaction:

> **Simulated Stock Trade**

A transaction starts when a user submits a trade request and ends when the trade is accepted or rejected. An accepted trade updates the user's simulated cash balance and stock holdings.

---

## 2. Business Need

Someone learning to trade may want to practice without risking real money. A paper trading system also needs consistent rules so users can see what happened to each trade.

MarketStreet aims to address these needs:

- Users need a simple way to submit simulated buy and sell orders.
- Orders must be checked for missing or invalid information.
- A user should not be able to buy more stock than their simulated cash allows or sell more shares than they own.
- Cash balances and stock holdings should stay accurate after every accepted trade.
- Users need to know whether a trade was accepted or rejected and why.
- Each trade needs a record that can be reviewed later.

---

## 3. Primary Users / Stakeholders

| Stakeholder | Primary Need |
|---|---|
| Beginner Investor (User) | Place simulated trades and view their portfolio and trade status |
| System Administrator | Keep the system available and see failed or rejected trades |
| Market Data Provider | Receive requests that follow its usage terms and rate limits |
| Compliance / Audit Reviewer | Trace every trade through its records and timestamps |
| Development Team | Build and maintain the interface, trade rules, and data storage |
| Course Instructor | Review the transaction design and the team's implementation |

Full details are in [Stakeholders](../02-requirements/Stakeholders.md).

---

## 4. Main Transaction

### Transaction name

**Simulated Stock Trade**

### Transaction trigger

A signed-in user submits a Market order to buy or sell a selected stock with a specified number of shares.

### Transaction outcome

The order is either:

- **Accepted:** The simulated trade is completed and the user's cash and holdings are updated; or
- **Rejected:** The trade is not completed, the reason is recorded, and cash and holdings remain unchanged (or are rolled back to their previous values if the final commit fails).

### Example transaction

A user with $1,000 in simulated cash submits an order to buy 2 shares of a stock at a simulated execution price of $100 per share. The system checks the order, the price, and available cash. If the checks pass and the atomic commit succeeds, the system records an accepted $200 trade and updates the user's cash to $800 and holdings by 2 shares.

The team's state model has four official statuses: **Submitted → Validated → Accepted**, with a path to **Rejected** if a rule fails or the portfolio update cannot be completed. Before submission, the order is only an unsaved **Draft** form in the browser; Draft is not a status. (In the built system, Submitted and Validated are steps inside one request, and only the final status, Accepted or Rejected, is saved; see decision D-19.)

---

## 5. Initial Scope

### In scope

- Signing in to a simulated trading account (the application supplies the user ID)
- A web form for entering a stock symbol, buy/sell choice, and number of shares (Market orders only)
- Validation of required trade details and positive whole-share quantities
- A simulated execution price (no older than 15 minutes, BR-6) and trade-value calculation
- Checks for enough simulated cash to buy or enough shares to sell
- Application-controlled transaction states: Submitted, Validated, Accepted, and Rejected
- A unique transaction ID and important timestamps
- Updating simulated cash, stock holdings, and the Accepted record together in one atomic commit
- Recording accepted and rejected transactions, displaying the result to the user, and listing both in transaction history
- Storing official trade and portfolio records in a database as the application is developed

### Out of scope for the initial documented transaction

- Trading with real money or placing orders on a real exchange
- Real brokerage or bank account connections
- Real deposits and withdrawals
- Live execution on an actual stock market
- **Limit orders:** The current four-status workflow covers immediate Market execution only. Limit orders are rejected under BR-9. Supporting them later would need new rules and an additional status for orders waiting to execute.

---

## 6. Success Criteria

MarketStreet succeeds as a course project when it demonstrates that a simulated stock trade can be:

1. entered through a usable web form;
2. checked for valid input and enough cash or shares;
3. given a unique transaction ID and a controlled status;
4. executed at a defined simulated price, or rejected with a clear reason;
5. reflected correctly in the user's cash balance and stock holdings if accepted;
6. saved as an official transaction record;
7. displayed to the user with its outcome; and
8. reviewed later using its transaction details, timestamps, and history.

These capabilities will be developed and documented as the course project progresses.
