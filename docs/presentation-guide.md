# Final presentation guide (Nov 30)

The grade is individual and rewards understanding over speaking time. Every member presents one technical part (assign below) and must also be able to explain the whole request flow.

**The one-sentence flow to know cold:** AWS Amplify hosts the website. The browser sends JSON with `fetch()` to API Gateway, which checks the Cognito token and invokes one Lambda (`aws/lambda/index.js`). The Lambda re-validates the order, saves it to DynamoDB in one write (an Accepted order and its cash change in one atomic transaction), and returns a confirmation number that the page shows and can look up again with `GET`.

**Owners (proposed, edit as needed):** Austin opens the recording, introduces every member and their part (camera on), and presents Parts E, F and G (the live demo). Sophia presents C, Agah D, Benjamin A, Arya B and Shayaan H. Every member must still be able to explain the whole request flow.

| Part | Owner (proposed) | What to say | Files to open |
|---|---|---|---|
| Intro | Austin | Group 14, the six members and who presents which part. Everyone's face on camera. | — |
| A. Business problem and requirements | Benjamin | Students practice investing with simulated money. Main transaction: submit a Buy or Sell order. Users: students and admins. Rules BR-1 to BR-9, requirements FR-1 to FR-12, user stories with Given/When/Then. | `docs/01-project-foundation/`, `docs/02-requirements/` |
| B. Repository structure | Arya | `frontend/` pages and scripts, `aws/lambda/` backend and tests, `docs/` design, `Testing/` evidence, `archive/` earlier coursework, `.github/workflows/test.yml` runs the tests on every push. | repo root, `README.md` |
| C. Frontend | Sophia | HTML form with labels and `min`/`step`; `trade.js` reads the DOM, checks the quantity, shows a review step, builds the JSON, calls `api()` (a `fetch()` wrapper in `app.js`), and shows the response. `auth.js` keeps the Cognito token and sends it as `Authorization`. | `frontend/trade.html`, `trade.js`, `app.js`, `auth.js`, `activity.js` |
| D. Backend and business rules | Agah | `validateOrder` checks type, symbol, order type, quantity and price (BR-1/2/3/6/9); `checkAccount` checks cash and shares (BR-4/5). The browser's checks can be bypassed, so the server repeats all of them and never trusts a price, ID, status or time from the browser. Rejections are saved with a reason and category. | `aws/lambda/backend/trades.js`, `index.js` (`postTrade`, `saveRejected`) |
| E. HTTP, AWS Amplify, API Gateway, Lambda | Austin | AWS Amplify hosts the static `frontend/` files at the public URL (built from GitHub with `amplify.yml`); it only serves pages and runs no business logic. POST creates, GET reads. API Gateway is the public door: routes, CORS, and a JWT authorizer that rejects missing or bad tokens before Lambda runs. Lambda runs `index.handler`, which routes by method and path. Why serverless: short request-driven work, nothing to patch, pay per request. | `aws/lambda/index.js` (`route`), `aws/README.md`, `amplify.yml` |
| F. DynamoDB | Austin | Six tables: Trades (`transactionId`), Accounts (`userId`: `cashCents` and a `holdings` map), Games, Users, Audit, Learn. An accepted POST saves the trade and updates cash/holdings in one `TransactWrite` (all or nothing, BR-7), with a condition that re-checks cash or shares. A rejected POST saves one Rejected record. Only the final status is stored (D-19). GET reads by key. Indexes serve per-user lists. Point-in-time recovery restores deleted records (check that it is turned on before you say so). | `aws/lambda/backend/accounts.js` (`commitTrade`), `index.js` (`getTrade`) |
| G. Live demo and testing | Austin | Follow the live-demo checklist below. Then show the testing: the 36-case matrix (24 cases run live on the Grader check page, 11 are recorded manual results) and the automated tests in `aws/lambda/tests/` that GitHub Actions runs on every push. | deployed site, `/grader.html`, `Testing/Final-Milestone/MarketStreet-Test-Matrix.pdf`, `.github/workflows/test.yml` |
| H. Challenges and decisions | Shayaan | Atomic commit so two orders cannot spend the same cash; duplicate-order control with `requestId`; why rejections are recorded; page-load jumpiness fixed with cached data and reserved space; admin role stored in the database because Learner Lab limits IAM. | `docs/decisions.md` |

## Live-demo checklist (Part G)

The course says a slideshow alone does not count. Show each of these on the deployed site:

- [ ] **Valid order:** open the site, explain the screen, submit a Buy, and point at the confirmation number.
- [ ] **Invalid order:** for example, a Buy larger than your cash. Show the rejection message.
- [ ] **Boundary:** for example, the largest affordable Buy (82 NVDA from $10,000), then one more share.
- [ ] **Missing or bad input:** quantity 0 or blank. Show the field message.
- [ ] **Error handling:** look up a number that does not exist (`00000000-0000-4000-8000-000000000000`). A database failure cannot be safely reproduced, so show the code in `index.js` that handles it.
- [ ] **Still usable after an error:** submit a valid order right after the rejected one.
- [ ] **Proof it is in DynamoDB:** open the record in the AWS console (DynamoDB → `MarketStreetTrades` → Explore items).
- [ ] **Retrieval:** Activity → Check transaction status → paste the confirmation number → View status.

## Before you record

- [ ] Start the AWS Learner Lab and keep it running for the whole recording. When the lab is stopped, trades, Activity and the Learn quiz fail with "Something went wrong".
- [ ] Open the site in a private window and test sign-in with the account you will use.
- [ ] Place one test trade to check that the backend answers.
- [ ] Every member: camera on, face visible while speaking. A member whose face is not visible gets zero for their individual grade.

## Submission checklist (due Mon Nov 30, 11:59 PM CT)

The team leader submits once on Canvas for the whole group and names every member:

- [ ] The recording, with every member's face visible while they present (check that it plays)
- [ ] The slides (PowerPoint or PDF)
- [ ] The GitHub repository link
- [ ] The deployed URL: https://main.d2kb3xv6llewil.amplifyapp.com
- [ ] The updated team tracker (`docs/05-team-management/team-tracker.xlsx`)

## Questions you should be able to answer

- Why does the backend validate again if the browser already did? *(Browser checks can be bypassed; the server is the trusted layer. "Browser helps, application decides, data remembers.")*
- What is the difference between validation, a business rule and an internal control? *(Usable data / what the business requires / what makes the process trustworthy, such as permissions, audit log, duplicate prevention.)*
- Two people click Buy at the same time with the same cash. What happens? *(The commit is a DynamoDB conditional write that re-checks cash; DynamoDB does not lock the row. The second order's condition fails, and it is recorded as Rejected.)*
- What does API Gateway do that Lambda does not? *(Routing, CORS, token check, throttling; Lambda only runs code.)*
- Why Lambda instead of EC2? *(See part E.)*
- Where does the confirmation number come from, and why not the browser? *(Server-generated after validation; the browser cannot choose the official ID, status or timestamp.)*
- How does the status lookup work? *(GET `/api/trades/{id}` → Lambda → DynamoDB `GetItem` → JSON → page; unknown ID returns 404; another user's ID also returns 404.)*
- Availability vs backup? *(Managed services keep it running; point-in-time recovery restores lost records. Different problems.)*
- What happens if DynamoDB is down mid-order? *(The transaction saves nothing, so cash and holdings do not change. The server tries to save a Rejected record with category System and answers 500. The user is told the trade was not saved.)*
- Is "not enough cash" validation or a business rule, and how do you test its boundary? *(A business rule, BR-4: the data is valid but the account cannot cover it. Exactly enough cash is allowed and one cent short is rejected. Those exact cases are unit tests in `aws/lambda/tests/trades.test.js` ("Buy with cash exactly equal to cost", "Buy with cash 1 cent short"). The live matrix cases T11 and T12 test near the limit: the largest affordable Buy, then one more share.)*

## Be honest about scope

The admin console, audit log, portfolio history and leaderboards go beyond the core transaction. Know which files implement them (`backend/admin.js`, `backend/users.js`, `backend/games.js`), or keep them out of the demo and answer only if asked.

## Presenting with the Demo page and the QR code

- **Demo** (header link) walks one real order through all seven layers, one step on screen at a time. Back, Next and Reset sit in a bar fixed at the bottom (the left and right arrow keys work too), and the tracker at the top jumps back to any finished step. Each step has a sentence to say and a "Point at" cue. The layers are: browser JSON, API Gateway and the token, Lambda, the business rules (each marked Passed, Failed or Not checked), the DynamoDB record, the GET retrieval, and the result. The presets cover a valid order, quantity 0, not enough cash, and selling shares you don't own, so it also shows the server enforcing the rules on its own. A valid order really changes your paper account.
- The rule step needs the latest Lambda deployed (it returns `trace` when the request asks for it). Without it the step says so instead of failing.
- **QR code** (header button) shows a large code for the audience. Paste the final site address into its Link box before you present; it is remembered in that browser.
