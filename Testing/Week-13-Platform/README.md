# Week 13 — Platform Test Plan and Evidence

Covers trades, profiles, account reset, the admin console, and the audit log.

## Boundary tests

Where each case is tested: **unit** = the automated tests in `aws/lambda/tests/trades.test.js` (they fix the cash, holdings and price time exactly); **live** = the 36-case matrix in [Final-Milestone](../Final-Milestone/README.md).

| Case | Input | Expected | Tested in |
|---|---|---|---|
| Quantity 0 | Buy 0 | Rejected (Rule), BR-3 | unit, live (T03) |
| Quantity 1 | Buy 1 | Accepted if cash is enough | unit, live (T01) |
| Quantity 1.5 | Buy 1.5 | Rejected (Rule), BR-3 | unit, live (T04) |
| Cash exactly enough | Buy where value = cash | Accepted, cash becomes $0.00 | unit ("Buy with cash exactly equal to cost") |
| Cash 1 cent short | Buy where value = cash + $0.01 | Rejected (Rule), BR-4 | unit ("Buy with cash 1 cent short") |
| Shares exactly owned | Sell all owned shares | Accepted, holding becomes 0 | unit ("Sell exactly the shares owned"), live (T13) |
| One more than owned | Sell owned + 1 | Rejected (Rule), BR-5 | unit ("Sell one more than owned"), live (T14) |
| Price age 15 min | Price quoted exactly 15 minutes before the check | Accepted, BR-6 | unit ("quote exactly 15 minutes old") |
| Price age 15 min + 1 ms | 15 minutes and 1 ms old | Rejected ("Price unavailable."), BR-6 | unit ("quote 15 minutes and 1 ms old") |

The live site cannot fake an old price, so the two BR-6 cases are only in the unit tests. The live cash cases T11 and T12 test near the limit (the largest affordable Buy leaves $45.20, then one more share is $76.20 short); they are not the exact-cent pair.

## Automated tests

Run from `aws/lambda`: `npm ci`, then `npm test`. This runs 94 tests in 9 files (on Nov 27) with an in-memory stand-in for DynamoDB:

| File | What it covers |
|---|---|
| `tests/trades.test.js` | The business rules BR-1 to BR-6 and BR-9, including the boundary cases above |
| `tests/platform.test.js` | Trades, accounts, Rejected records, the trade list, duplicate control, profiles, account reset, the admin console and the audit log |
| `tests/history.test.js` | The account value history (one point per day) |
| `tests/games.test.js` | Scenario Mode (Challenges) rules and the `/api/games` routes |
| `tests/leaderboard.test.js` | The portfolio leaderboard (ranks players, hides emails, leaves out disabled players) |
| `tests/learn.test.js` | The public Learn quiz routes |
| `tests/guest.test.js` | Guest mode, which runs in the browser |
| `tests/trace.test.js` | The request trace that the Demo page shows |
| `tests/routing.test.js` | Unknown paths get 404 (never a trade), wrong methods get 405, capital-letter confirmation numbers, consistent reads, BR-6 saved as a Rule rejection, the 1,000,000-share cap |

## Manual smoke checklist

These are the manual checks to run on the live site. A box is ticked only when someone has run the check and saved the evidence below.

- [ ] Sign in as a regular user and as an admin
- [ ] Accepted trade appears in Activity
- [ ] Rejected trade appears in Activity with its reason
- [ ] User resets the account (type RESET); history is kept
- [ ] Admin adjusts a user's cash; the audit log shows before and after
- [ ] Admin disables a user, the user is refused, then enables them again
- [ ] Audit log shows every admin action above
- [ ] Non-admin calling an `/api/admin` route gets 403 and `authz.denied` is audited

## Evidence

What exists today:

- **Automated tests:** `npm test` in `aws/lambda` passed 94 of 94 tests on 2026-11-27 (a local run during the documentation review). GitHub Actions ([`.github/workflows/test.yml`](../../.github/workflows/test.yml)) runs the same tests on every push and pull request; see the repository's **Actions** tab for each run.
- **Live checks:** the [Grader check page](https://main.d2kb3xv6llewil.amplifyapp.com/grader.html) submits real orders, looks them up by confirmation number, and runs the 24 automated matrix cases against the deployed backend. It needs a signed-in account and a running AWS Learner Lab.
- **Test matrix results:** [Testing/Final-Milestone/](../Final-Milestone/README.md) has the 36-case matrix (Excel and PDF) with expected and actual results.

Not yet recorded: screenshots for the manual smoke checklist above. Add them here (for example `Testing/Week-13-Platform/evidence/`) when the checks are run.
