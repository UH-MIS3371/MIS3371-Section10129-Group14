# Week 13 — Platform Test Plan and Evidence

Covers trades, profiles, account reset, the admin console, and the audit log.

## Boundary tests

| Case | Input | Expected |
|---|---|---|
| Quantity 0 | Buy 0 | Rejected (Rule), BR-3 |
| Quantity 1 | Buy 1 | Accepted if cash is enough |
| Quantity 1.5 | Buy 1.5 | Rejected (Rule), BR-3 |
| Cash exactly enough | Buy where value = cash | Accepted, cash becomes $0.00 |
| Cash 1 cent short | Buy where value = cash + $0.01 | Rejected (Rule), BR-4 |
| Shares exactly owned | Sell all owned shares | Accepted, holding becomes 0 |
| One more than owned | Sell owned + 1 | Rejected (Rule), BR-5 |
| Price age 15 min | `priceTimestamp` exactly 15 minutes before `submittedAt` | Accepted, BR-6 |
| Price age 15 min + 1 ms | 15 minutes and 1 ms old | Rejected (Rule), BR-6 |

## Automated tests

Run from `aws/lambda`: `npm test`

- `aws/lambda/tests/games.test.js`
- `aws/lambda/tests/platform.test.js`

## Manual smoke checklist

- [ ] Sign in as a player and as an admin
- [ ] Accepted trade appears in history
- [ ] Rejected trade appears in history with its reason
- [ ] Player resets the account (type RESET); history is kept
- [ ] Admin adjusts a user's cash; the audit log shows before and after
- [ ] Admin disables a user, the user is refused, then enables them again
- [ ] Audit log shows every admin action above
- [ ] Non-admin calling an `/api/admin` route gets 403 and `authz.denied` is audited

## Evidence

Add screenshots and test output below.
