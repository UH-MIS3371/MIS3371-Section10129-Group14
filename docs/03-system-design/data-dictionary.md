# MarketStreet — Data Dictionary

The data dictionary defines the fields used to submit, validate, execute, and record a simulated stock trade in MarketStreet, and the account data that an accepted trade changes. Every table below matches what the Lambda in [`aws/lambda/`](../../aws/lambda/) actually sends and stores.

## API request body

The browser sends one JSON object to `POST /api/trades` (built in `frontend/trade.js`). The request uses short names. The Lambda copies the values into the saved record under the record's own names.

| Request field | Type | Required? | Rule | Saved in the record as |
|---|---|---|---|---|
| `symbol` | string | Yes | Trimmed and upper-cased, then it must be in the server's price list (BR-2) | `stockSymbol` |
| `tradeType` | string | Yes | Exactly `Buy` or `Sell` (BR-1) | `tradeType` |
| `quantity` | number | Yes | A JSON number that is a whole number from 1 to 1,000,000. The string `"2"`, `1.5`, `0` and negatives are rejected (BR-3). A whole number above 1,000,000 gets "Quantity is too large." | `shareQuantity` |
| `orderType` | string | Yes | Exactly `Market`; `Limit` gets its own message (BR-9) | `orderType` |
| `requestId` | string (UUID) | No | If sent, it must be a UUID. The server uses it to make the `transactionId`, so a retry returns the first result (IC-6) | `requestId` |

Example request (the `requestId` is a new UUID for each order attempt):

```json
{
  "symbol": "AAPL",
  "tradeType": "Buy",
  "quantity": 5,
  "orderType": "Market",
  "requestId": "3f2b8c1e-7a4d-4e0a-9b51-2c6d8e1f0a77"
}
```

The server ignores any other field. A price, cash amount, ID, status or time sent by the browser is never used (IC-7). The signed-in user comes from the Cognito token, not from the body (FR-7).

## Core Transaction Fields (Trades table)

These fields make up the **official transaction record** in `MarketStreetTrades` (partition key `transactionId`). The Lambda saves one record for every order it can process, whether it is accepted or rejected. It writes the record **once**, with its final status (D-19).

| Field | Business Meaning | Category | Type | Required? | Source | Rule / Constraint | Example |
|---|---|---|---|---|---|---|---|
| `transactionId` | Unique identifier for one order; the confirmation number | System | string (UUID) | Yes — system generated | Application | A random UUID (`crypto.randomUUID()`). If the request has a `requestId`, it is a UUID-shaped value made from a SHA-256 hash of `userId:requestId`, so a retry gets the same ID (D-14). Lower case. Never changes | `89300543-6517-4f55-bf13-3307d81f8116` |
| `requestId` | Browser-generated UUID for one order attempt | System | string (UUID) | No | Browser | Optional. Used only to make `transactionId` (IC-6). Stored on the record when it was sent | `3f2b8c1e-7a4d-4e0a-9b51-2c6d8e1f0a77` |
| `userId` | Identifies the account placing the trade | Derived / reference | string | Yes | Signed-in session | The Cognito user ID (the token's `sub` claim). Never accepted from browser input (FR-7) | `94e8a4f8-0071-70d2-5c1e-3b2a9d6f1c04` |
| `stockSymbol` | Stock being bought or sold | User | string | Yes on Accepted records | Request field `symbol` | Must be a recognized stock symbol (BR-2). On a Rejected record it holds up to 12 characters of what was sent, or `null` | `AAPL` |
| `tradeType` | Whether the user is buying or selling | User | enum | Yes on Accepted records | Request field `tradeType` | `Buy` or `Sell` only (BR-1). On a Rejected record it holds what was sent (up to 12 characters), or `null` | `Buy` |
| `shareQuantity` | Number of shares requested | User | integer | Yes on Accepted records | Request field `quantity` | Whole number from 1 to 1,000,000 (BR-3). On a Rejected record it is `null` if the value sent was not a number | `5` |
| `orderType` | Type of order | User | enum | Yes on Accepted records | Request field `orderType` | `Market` only. The form does not offer a choice; any other value is rejected (BR-9) | `Market` |
| `executionPrice` | Simulated price per share used to value and execute the trade | Derived | number (dollars, 2 decimals) | Once a valid price is obtained | Price source (`market-data.js`) | Must be a valid price (BR-6): greater than 0, a whole number of cents. Never taken from user input | `185.5` |
| `transactionValue` | Total simulated value of the trade | Derived | number (dollars, 2 decimals) | Once a valid price is obtained | Application | `shareQuantity × executionPrice`; used for the BR-4 cash check | `927.5` |
| `priceTimestamp` | Time the price source quoted `executionPrice` | Derived / audit | ISO 8601 datetime | Once a valid price is obtained | Price source | No more than 15 minutes old when the order is checked (BR-6) | `2026-11-21T20:21:09.000Z` |
| `status` | Final official trade status | System | enum | Yes — system controlled | Application | Only `Accepted` or `Rejected` is ever stored. Submitted and Validated are processing steps inside one Lambda call; they are never saved (D-19). Draft is a browser form state | `Accepted` |
| `rejectionReason` | Explanation of why a trade was rejected | System | string | If rejected | Application | Required when status is `Rejected`; written for the user to read | `Insufficient cash.` |
| `rejectionCategory` | Whether the rejection came from a business rule or a system failure | System | enum | If rejected | Application | `Rule` (the order broke BR-1 to BR-6 or BR-9, or the request was malformed) or `System` (the commit failed, BR-8) | `Rule` |
| `submittedAt` | Time the application received the order | System / audit | ISO 8601 datetime | Yes — system generated | Application | Set when the Lambda starts processing the order | `2026-11-21T20:21:08.512Z` |
| `validatedAt` | Time the checks finished | System / audit | ISO 8601 datetime | Yes | Application | Set on every saved record | `2026-11-21T20:21:08.530Z` |
| `completedAt` | Time the trade reached its final status | System / audit | ISO 8601 datetime | Yes | Application | Set when the record is written | `2026-11-21T20:21:08.531Z` |
| `updatedAt` | Time the record was written | System / audit | ISO 8601 datetime | Yes — system generated | Application | Same as `completedAt`. Records are never changed after they are written (NFR-4) | `2026-11-21T20:21:08.531Z` |

The trades table has one index, `userId-submittedAt-index` (partition `userId`, sort `submittedAt`). `GET /api/trades` uses it to list one user's trades, newest first.

## Account Data

An accepted trade changes the account (BR-7). The Lambda reads the account for the BR-4 and BR-5 checks. It then saves the trade and the account change in one DynamoDB transaction. That transaction has a condition that checks the cash or shares again, so the save fails if the account changed in between. DynamoDB does not lock the account; the conditional write does this job (D-4, D-19).

### Account (Accounts table)

`MarketStreetAccounts`, partition key `userId`. One item per user. Holdings are a map inside the account item, not a separate table.

| Field | Business Meaning | Type | Rule / Constraint | Example |
|---|---|---|---|---|
| `userId` | Identifies the simulated account | string | Primary key; the Cognito user ID, the same as `userId` on trade records | `94e8a4f8-0071-70d2-5c1e-3b2a9d6f1c04` |
| `cashCents` | Simulated cash available to spend, in whole cents | integer | Never negative. Every new account starts with **1,000,000 cents ($10,000.00)** (D-10) | `1000000` |
| `holdings` | Shares owned per stock | map of symbol → integer | Each count is never negative (no short selling in the main transaction, BR-5). A new account has none: `{}` | `{ "AAPL": 10, "MSFT": 2 }` |
| `createdAt` | Time the account was created | ISO 8601 datetime | Set the first time the account is used | `2026-11-20T18:00:00.000Z` |
| `updatedAt` | Time cash or holdings last changed | ISO 8601 datetime | Set in the same transaction as the Accepted record | `2026-11-21T20:21:08.531Z` |
| `resetAt` | Time the account was last reset | ISO 8601 datetime | Set when the user resets the account (FR-10). Trade history is kept | `2026-11-21T09:00:00.000Z` |

### User profile (Users table)

`MarketStreetUsers`, partition key `userId`.

| Field | Business Meaning | Type | Rule / Constraint | Example |
|---|---|---|---|---|
| `userId` | Identifies the user | string | Primary key; the Cognito user ID | `94e8a4f8-0071-70d2-5c1e-3b2a9d6f1c04` |
| `name` | Display name shown in the app | string | 3 to 20 letters, numbers, spaces (FR-9). Starts as the Cognito `nickname` | `Austin N` |
| `email` | Sign-in email | string | From the Cognito token | `a@example.edu` |
| `role` | Role set by an admin | enum | Optional. `admin` or `user`. When set, it wins over the Cognito group (D-11) | `admin` |
| `tokenAdmin` | Whether the Cognito token says the user is in the `admins` group | boolean | Copied from the token. Used only when `role` is not set | `false` |
| `disabled` | Whether the user is blocked | boolean | Optional. Disabled users are refused (IC-8) | `false` |
| `tokensValidAfter` | Tokens issued before this time are refused | ISO 8601 datetime | Optional. Set by sign out everywhere or an admin's forced sign-out | `2026-11-21T09:00:00.000Z` |
| `valueHistory` | Account value per day, for the portfolio chart | map of date → cents | Written when the user opens their profile | `{ "2026-11-21": 1000000 }` |
| `createdAt` | Time the profile was created | ISO 8601 datetime | Set once | `2026-11-20T18:00:00.000Z` |
| `lastSeenAt` | Time the user was last active | ISO 8601 datetime | Written at most every 5 minutes | `2026-11-21T20:21:00.000Z` |
| `version` | Save counter | integer | Each save must have the version it read, so two saves cannot overwrite each other | `3` |

### Audit entry (Audit table)

`MarketStreetAudit`, partition key `auditId`.

| Field | Business Meaning | Type | Rule / Constraint | Example |
|---|---|---|---|---|
| `auditId` | Unique identifier of the entry | string | Primary key; system generated as `<ISO time>#<UUID>` | `2026-11-21T09:00:00.000Z#5f0c2a8e-1b7d-4c3e-9a64-0d2e8b7f3c19` |
| `at` | Time of the action | ISO 8601 datetime | Set by the server | `2026-11-21T09:00:00.000Z` |
| `action` | What was done | string | One of `account.reset`, `account.cash_adjust`, `user.disable`, `user.enable`, `user.role.promote`, `user.role.demote`, `session.sign_out_all`, `profile.rename`, `authz.denied` | `account.cash_adjust` |
| `actorId` / `actorEmail` | Who did it | string | From the signed-in session | `94e8a4f8-…` / `a@example.edu` |
| `targetId` / `targetEmail` | Who was affected | string | The user the action applied to | `0b1c…` / `b@example.edu` |
| `before` / `after` | Value before and after the change | object | Admin actions write the entry before the change (IC-3). Money is in cents | `{ "cashCents": 1000000 }` / `{ "cashCents": 1050000 }` |
| `reason` | Admin's stated reason | string | Optional, up to 200 characters | `Class demo` |
| `path` | The admin address that was refused | string | Only on `authz.denied` entries | `/api/admin/users` |
| `result` | Outcome | string | `success` or `failure`. A refused admin request (`authz.denied`) is a `failure`. So is an admin change that failed after its entry was written | `success` |

Entries are append-only (IC-4).

## Money Rules

- Account cash is stored in **whole cents** as an integer (`cashCents`). Every price is a whole number of cents.
- Trade records show `executionPrice` and `transactionValue` in dollars. A price has at most two decimal places and share quantities are whole numbers, so `transactionValue` is always an exact number of cents.
- The BR-4 cash check compares whole cents, never floating-point dollars, so "exactly enough cash" compares correctly (D-8).

Details: [Trade states](state-diagram.md) · [Trade processing and saves](workflow.md) · [Tier responsibilities](short-responsibility-notes.md).
