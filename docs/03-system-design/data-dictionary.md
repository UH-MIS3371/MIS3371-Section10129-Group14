# MarketStreet — Data Dictionary

The data dictionary defines the fields used to submit, validate, execute, and record a simulated stock trade in MarketStreet, and the account data that an accepted trade changes.

## Core Transaction Fields

These fields make up the **official transaction record**. One record is created for every trade the application receives, whether it is accepted or rejected.

| Field | Business Meaning | Category | Type | Required? | Source | Rule / Constraint | Example |
|---|---|---|---|---|---|---|---|
| `transactionId` | Unique identifier for one submitted trade | System | string | Yes — system generated | Application | Generated once when the application receives a trade; must be unique and immutable | `TRD-00418` |
| `requestId` | Browser-generated UUID for one order attempt | System | string (UUID) | Yes | Browser | Used only to derive `transactionId` (IC-6); a repeated `requestId` returns the first result | `3f2b8c1e-7a4d-4e0a-9b51-2c6d8e1f0a77` |
| `userId` | Identifies the account placing the trade | Derived / reference | string | Yes | Signed-in session | Taken from the signed-in session (FR-7); never accepted from browser input | `U10427` |
| `stockSymbol` | Stock being bought or sold | User | string | Yes | User | Must be a recognized stock symbol (BR-2) | `AAPL` |
| `tradeType` | Whether the user is buying or selling | User | enum | Yes | User | `Buy` or `Sell` only (BR-1) | `Buy` |
| `shareQuantity` | Number of shares requested | User | integer | Yes | User | Positive whole number (BR-3) | `5` |
| `orderType` | Type of order | System | enum | Yes | Application (always `Market` in the current scope) | `Market` only. The form does not offer a choice; any other value that reaches the application is rejected (BR-9) | `Market` |
| `executionPrice` | Simulated price per share used to value and execute the trade | Derived | decimal(10,2) | Once a valid price is obtained | Price source | Must be a valid price (BR-6): greater than 0, at most 2 decimal places. Never taken from user input | `185.50` |
| `transactionValue` | Total simulated value of the trade | Derived | decimal(12,2) | Once a valid price is obtained | Application | `shareQuantity × executionPrice`; used for the BR-4 cash check | `927.50` |
| `priceTimestamp` | Time the price source quoted `executionPrice` | Derived / audit | datetime | Once a valid price is obtained | Price source | No more than 15 minutes older than `submittedAt` (BR-6) | `2026-09-20T20:21:09Z` |
| `status` | Current official trade state | System | enum | Yes — system controlled | Application | `Submitted`, `Validated`, `Accepted`, or `Rejected`; only allowed state transitions may occur. (Draft is a browser form state, not a status.) | `Accepted` |
| `rejectionReason` | Explanation of why a trade was rejected | System | string | If rejected | Application | Required when status is `Rejected`; written for the user to read | `Insufficient cash` |
| `rejectionCategory` | Whether the rejection came from a business rule or a system failure | System | enum | If rejected | Application | `Rule` (BR-1 to BR-6, BR-9) or `System` (commit failed and was rolled back, BR-8) | `Rule` |
| `submittedAt` | Time the application received the trade | System / audit | datetime | Yes — system generated | Application | Set when the official trade record is created | `2026-09-20T20:21:08Z` |
| `validatedAt` | Time the trade passed validation | System / audit | datetime | If validated | Application | Set when status becomes `Validated` | `2026-09-20T20:21:09Z` |
| `completedAt` | Time the trade reached a final outcome | System / audit | datetime | If final | Application | Set when status becomes `Accepted` or `Rejected` | `2026-09-20T20:21:10Z` |
| `updatedAt` | Time the official trade record was last updated | System / audit | datetime | Yes — system generated | Application | Updated whenever the record changes; no changes are allowed after `completedAt` | `2026-09-20T20:21:10Z` |

## Account Data

An accepted trade changes these records (BR-7). They are read for the BR-4 and BR-5 checks and locked during the final commit.

### Account

| Field | Business Meaning | Type | Rule / Constraint | Example |
|---|---|---|---|---|
| `userId` | Identifies the simulated account | string | Primary key; matches `userId` on transaction records | `U10427` |
| `cashBalance` | Simulated cash available to spend | decimal(12,2) | Never negative; every new account starts with **$10,000.00** | `10000.00` |
| `updatedAt` | Time the balance last changed | datetime | Set in the same commit as the Accepted record | `2026-09-20T20:21:10Z` |
| `resetAt` | Time the account was last reset | datetime | Set when the user or an admin resets the account (FR-10, FR-11); history is kept | `2026-09-21T09:00:00Z` |

### Holding

| Field | Business Meaning | Type | Rule / Constraint | Example |
|---|---|---|---|---|
| `userId` | Account that owns the shares | string | Part of the key (`userId` + `stockSymbol`) | `U10427` |
| `stockSymbol` | Stock held | string | Recognized symbol (BR-2) | `AAPL` |
| `sharesOwned` | Number of shares currently owned | integer | Never negative (no short selling, BR-5) | `10` |

### User profile (Users table)

| Field | Business Meaning | Type | Rule / Constraint | Example |
|---|---|---|---|---|
| `userId` | Identifies the user | string | Primary key; the Cognito user ID | `U10427` |
| `displayName` | Name shown in the app | string | 3 to 20 letters, numbers, spaces (FR-9) | `Austin N` |
| `email` | Sign-in email | string | From Cognito | `a@example.edu` |
| `role` | Stored role override | enum | `player` or `admin`; works without Cognito admin permissions (D-11) | `admin` |
| `disabled` | Whether the user is blocked | boolean | Disabled users are refused (IC-8) | `false` |
| `tokensValidAfter` | Tokens issued before this time are refused | datetime | Set by sign out everywhere or force sign-out | `2026-09-21T09:00:00Z` |

### Audit entry (Audit table)

| Field | Business Meaning | Type | Rule / Constraint | Example |
|---|---|---|---|---|
| `auditId` | Unique identifier of the entry | string | Primary key; system generated | `AUD-00091` |
| `at` | Time of the action | datetime | Set by the server | `2026-09-21T09:00:00Z` |
| `action` | What was done | string | One of `account.reset`, `account.cash_adjust`, `user.disable`, `user.enable`, `user.role.promote`, `user.role.demote`, `session.sign_out_all`, `profile.rename`, `authz.denied` | `account.cash_adjust` |
| `actorId` / `actorEmail` | Who did it | string | From the signed-in session | `U10001` |
| `targetId` / `targetEmail` | Who was affected | string | The user the action applied to | `U10427` |
| `before` / `after` | Value before and after the change | object | Written before the change is made (IC-3) | `10000.00` / `10500.00` |
| `reason` | Admin's stated reason | string | Optional text | `Class demo` |
| `result` | Outcome | string | Outcome of the action, for example `success` or `denied` | `success` |

Entries are append-only (IC-4).

## Money Rules

- All amounts are in US dollars with exactly two decimal places.
- Prices have at most two decimal places and share quantities are whole numbers, so `transactionValue` is always an exact number of cents and needs no rounding.
- Amounts are stored as fixed-point decimals (or whole cents), never as floating-point numbers, so that "exactly enough cash" (BR-4) compares correctly.

Details: [Trade states](state-diagram.md) · [Trade processing and saves](workflow.md) · [Tier responsibilities](short-responsibility-notes.md).
