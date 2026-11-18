# Final presentation guide (Nov 30)

The grade is individual and rewards understanding over speaking time. Every member presents one technical part (assign below) and must also be able to explain the whole request flow.

**The one-sentence flow to know cold:** the browser sends JSON with `fetch()` to API Gateway, which checks the Cognito token and invokes one Lambda (`aws/lambda/index.js`). The Lambda re-validates the order, saves it to DynamoDB in one atomic transaction, and returns a confirmation number that the page shows and can look up again with `GET`.

| Part | Owner | What to say | Files to open |
|---|---|---|---|
| A. Business problem and requirements | | Students practise investing with simulated money. Main transaction: submit a Buy or Sell order. Users: students and admins. Rules BR-1 to BR-9, requirements FR-1 to FR-12, user stories with Given/When/Then. | `docs/01-project-foundation/`, `docs/02-requirements/` |
| B. Repository structure | | `frontend/` pages and scripts, `aws/lambda/` backend and tests, `docs/` design, `Testing/` evidence, `archive/` earlier coursework, `.github/workflows/test.yml` runs the tests on every push. | repo root, `README.md` |
| C. Frontend | | HTML form with labels and `min`/`step`; `trade.js` reads the DOM, checks the quantity, shows a review step, builds the JSON, calls `api()` (a `fetch()` wrapper in `app.js`), and shows the response. `auth.js` keeps the Cognito token and sends it as `Authorization`. | `frontend/trade.html`, `trade.js`, `app.js`, `auth.js`, `activity.js` |
| D. Backend and business rules | | `validateOrder` checks type, symbol, order type, quantity and price (BR-1/2/3/6/9); `checkAccount` checks cash and shares (BR-4/5). The browser's checks can be bypassed, so the server repeats all of them and never trusts a price, ID, status or time from the browser. Rejections are saved with a reason and category. | `aws/lambda/backend/trades.js`, `index.js` (`postTrade`, `saveRejected`) |
| E. HTTP, API Gateway, Lambda | | POST creates, GET reads. API Gateway is the public door: routes, CORS, and a JWT authorizer that rejects missing or bad tokens before Lambda runs. Lambda runs `index.handler`, which routes by method and path. Why serverless: short request-driven work, nothing to patch, pay per request. | `aws/lambda/index.js` (`route`), `aws/README.md` |
| F. DynamoDB | | Tables: Trades (`transactionId`), Accounts (`userId`), Games, Users, Audit. POST saves the trade and updates cash/holdings in one `TransactWrite` (all or nothing, BR-7), with a condition that re-checks cash or shares. GET reads by key. Indexes serve per-user lists. Point-in-time recovery restores deleted records. | `aws/lambda/backend/accounts.js` (`commitTrade`), `index.js` (`getTrade`) |
| G. Live demo and testing | | Follow `Testing/Final-Milestone/README.md`: valid order, confirmation number, status lookup, invalid, boundary, duplicate retry, not-found lookup, rejected order is stored. | deployed site, `test-matrix.pdf` |
| H. Challenges and decisions | | Atomic commit so two orders cannot spend the same cash; duplicate-order control with `requestId`; why rejections are recorded; page-load jumpiness fixed with cached data and reserved space; admin role stored in the database because Learner Lab limits IAM. | `docs/decisions.md` |

## Questions you should be able to answer

- Why does the backend validate again if the browser already did? *(Browser checks can be bypassed; the server is the trusted layer. "Browser helps, application decides, data remembers.")*
- What is the difference between validation, a business rule and an internal control? *(Usable data / what the business requires / what makes the process trustworthy, such as permissions, audit log, duplicate prevention.)*
- Two people click Buy at the same time with the same cash. What happens? *(The commit re-checks cash inside the transaction; the second fails and is recorded as Rejected.)*
- What does API Gateway do that Lambda does not? *(Routing, CORS, token check, throttling; Lambda only runs code.)*
- Why Lambda instead of EC2? *(See part E.)*
- Where does the confirmation number come from, and why not the browser? *(Server-generated after validation; the browser cannot choose the official ID, status or timestamp.)*
- How does the status lookup work? *(GET `/api/trades/{id}` → Lambda → DynamoDB `GetItem` → JSON → page; unknown ID returns 404; another user's ID also returns 404.)*
- Availability vs backup? *(Managed services keep it running; point-in-time recovery restores lost records. Different problems.)*
- What happens if DynamoDB is down mid-order? *(Nothing partial is saved; the user is told it was not saved.)*
- Is "not enough cash" validation or a business rule, and how do you test its boundary? *(A business rule, BR-4: the data is valid but the account cannot cover it. Exactly enough cash is allowed, one cent short is rejected: T11 and T12.)*

## Be honest about scope

The admin console, audit log, portfolio history and leaderboards go beyond the core transaction. Know which files implement them (`backend/admin.js`, `backend/users.js`, `backend/games.js`), or keep them out of the demo and answer only if asked.

## Presenting with the Demo page and the QR code

- **Demo** (header link) walks one real order through all seven layers, one step on screen at a time. Back, Next and Reset sit in a bar fixed at the bottom (the left and right arrow keys work too), and the tracker at the top jumps back to any finished step. Each step has a sentence to say and a "Point at" cue. The layers are: browser JSON, API Gateway and the token, Lambda, the business rules (each marked Passed, Failed or Not checked), the DynamoDB record, the GET retrieval, and the result. The presets cover a valid order, quantity 0, not enough cash, and selling shares you don't own, so it also shows the server enforcing the rules on its own. A valid order really changes your paper account.
- The rule step needs the latest Lambda deployed (it returns `trace` when the request asks for it). Without it the step says so instead of failing.
- **QR code** (header button) shows a large code for the audience. Paste the final site address into its Link box before you present; it is remembered in that browser.
