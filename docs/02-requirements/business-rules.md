# MarketStreet — Business Rules

## Purpose

These business rules define when a simulated stock trade is allowed, rejected, and recorded in MarketStreet. They are intentionally limited to the main transaction for Milestone 1: **submitting a simulated stock Buy or Sell order**.

## Business Rules

### BR-1 — Valid Trade Type

A transaction must be either a **Buy** order or a **Sell** order. Any other transaction type is invalid and must be rejected.

### BR-2 — Valid Stock Symbol

A trade may only be submitted for a stock symbol recognized by the MarketStreet system. Unsupported or invalid stock symbols must be rejected.

### BR-3 — Valid Share Quantity

The number of shares entered must be a positive whole number greater than zero. Zero, negative, blank, non-numeric, or fractional quantities are not allowed. The server also caps one order at 1,000,000 shares, far more than the $10,000 starting cash can buy, so a huge number gets the clear message "Quantity is too large."

### BR-4 — Sufficient Simulated Cash for Buy Orders

A Buy order may only be accepted when the user has enough simulated cash to cover the full transaction value (`shareQuantity × executionPrice`).

- If the user has exactly enough simulated cash, the trade is allowed.
- If the user does not have enough simulated cash, the trade is rejected.
- The check is repeated inside the final commit (see BR-7). The commit is a DynamoDB conditional write that only succeeds if the saved cash still covers the cost, so two orders submitted at the same time cannot spend the same cash twice.

### BR-5 — Sufficient Holdings for Sell Orders

A Sell order may only be accepted when the user owns at least the number of shares being sold.

- Selling exactly the number of shares owned is allowed.
- Selling more shares than the user owns is rejected.
- Short selling is not allowed in the main trade. (The separate Challenges game has its own Short option; it does not use this account.)
- Like BR-4, the check is repeated inside the final commit, as a condition on the saved share count.

### BR-6 — Valid Stock Price Required

A trade cannot be completed unless the system has a valid stock price for the selected stock. A price is **valid** when:

- it is greater than $0.00 and has at most two decimal places, and
- its `priceTimestamp` is no more than **15 minutes** older than the trade's `submittedAt`.

If a valid price is unavailable, the transaction must be rejected and no account values may change.

The price is obtained **once**, during validation, and saved as the trade's `executionPrice`. The trade executes at that saved price. The price is **not** fetched again at commit; the commit only re-checks cash or shares (BR-4, BR-5).

### BR-7 — Accepted Trades Must Update the Simulated Portfolio

When a Buy order is accepted, the user's simulated cash balance decreases by the transaction value and the number of shares owned increases by the share quantity.

When a Sell order is accepted, the number of shares owned decreases by the share quantity and the user's simulated cash balance increases by the transaction value.

The cash update, the holdings update, and the Accepted transaction record are saved in **one atomic database commit**: either all three are saved or none are.

### BR-8 — Rejected Trades Must Not Change the Portfolio

If a transaction is rejected, the user's simulated cash balance and stock holdings must remain unchanged. The system must record a clear rejection reason and a rejection category:

- **Rule** — the order broke a business rule (BR-1 to BR-6, or BR-9), or the request was malformed (for example, an empty body). A BR-6 price failure ("Price unavailable.") is a Rule rejection.
- **System** — the order was valid, but the commit in BR-7 failed. The DynamoDB transaction saves nothing, so cash and holdings keep their previous values.

A rejected order is saved once, as a Rejected record. Submitted and Validated are processing steps and are never saved (D-19).

### BR-9 — Supported Order Type

Only **Market** orders are executed in the current scope. A Market order executes at the valid price from BR-6, never at a price entered by the user.

Limit orders are not supported. The interface should not offer Limit as a selectable option; if a Limit order reaches the application, it must be rejected with the reason "Limit orders are not supported."

## Internal controls

A **validation** checks that an input is well formed, a **business rule** decides whether a valid order is allowed (a valid order can still be rejected, for example for insufficient cash), and an **internal control** makes the process trustworthy by limiting who can do what and leaving evidence.

| # | Control |
|---|---|
| IC-1 | **Role check on every admin request.** The server checks the admin role on every `/api/admin` route. Refusals are audited as `authz.denied`. |
| IC-2 | **No self-lockout.** An admin cannot demote or disable themselves, and the last admin cannot be removed. |
| IC-3 | **Audit before change.** Every admin action writes its audit entry before the change. If the entry cannot be written, nothing changes. |
| IC-4 | **Append-only audit log.** Audit entries are never edited or deleted. |
| IC-5 | **Limits on adjustments.** Cash adjustments are at most ±$100,000 and cash never goes below $0. An admin account reset requires typing the user's email; a player's own reset requires typing `RESET`. |
| IC-6 | **Duplicate-order control.** The browser sends a `requestId` (UUID) with each order. The server derives the official `transactionId` from `userId` + `requestId`, so a retried order returns the first result instead of trading twice. |
| IC-7 | **Server-set IDs, timestamps, and status.** The browser never chooses `transactionId`, `userId`, status, timestamps, or price. |
| IC-8 | **Disabled users and forced sign-out.** A disabled user, or a token issued before `tokensValidAfter`, is refused. |
