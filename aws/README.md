# MarketStreet on AWS

This folder holds the live MarketStreet backend. The website in [`frontend/`](../frontend/) sends every trade here.

| AWS service | Name | Job |
|---|---|---|
| Amplify | MarketStreet site | Hosts `frontend/` (see [`amplify.yml`](../amplify.yml)) |
| API Gateway (HTTP API) | `MarketStreet-API` | Public address: `https://59w9sz4rrl.execute-api.us-east-1.amazonaws.com/api` (for example `/api/trades`) |
| Lambda | `MarketStreet-ProcessTrade` | Runs the code in [`lambda/`](lambda/) |
| Cognito | User pool `MarketStreetUsers` (`us-east-1_Bc2WPM5AD`), app client `MarketStreetWeb` (`39ufd4fucor0jpnhklpdqdo8lh`) | Sign-in. API Gateway checks its tokens (see [Sign-in and roles](#sign-in-and-roles-amazon-cognito)) |
| DynamoDB | `MarketStreetTrades` | Stores every trade record, Accepted and Rejected, keyed by `transactionId` |
| DynamoDB | `MarketStreetAccounts` | Stores the account's cash and holdings, keyed by `userId` (BR-7) |
| DynamoDB | `MarketStreetGames`, `MarketStreetUsers`, `MarketStreetAudit` | Scenario games, user profiles and roles, and the admin audit log |
| DynamoDB | `MarketStreetLearn` | Learn quiz runs, keyed by `runId` |
| CloudWatch Logs | `/aws/lambda/MarketStreet-ProcessTrade` | One JSON log line per request |

All resources are in `us-east-1`.

## What is in `lambda/`

| File | Purpose |
|---|---|
| [`index.js`](lambda/index.js) | Entry point (`index.handler`). Routes every `/api/*` request (trades, account, games, admin, learn) and writes logs. |
| [`backend/trades.js`](lambda/backend/trades.js) | Business rules: `validateOrder()` (BR-1–3, BR-6, BR-9) and `checkAccount()` (BR-4, BR-5). |
| [`backend/accounts.js`](lambda/backend/accounts.js) | Reads the account and saves an accepted trade together with the cash and holdings change in one DynamoDB transaction (BR-7), re-checking cash or shares inside it. |
| [`backend/market-data.js`](lambda/backend/market-data.js) | Simulated prices (`getQuote()`, with the BR-6 15-minute limit) and the starting account. Prices must match `frontend/data.js`. |
| [`local-server.js`](lambda/local-server.js) | Runs the Lambda and the website on your computer, with an in-memory stand-in for DynamoDB. Not uploaded to AWS. |

## The trade request

`POST /api/trades` takes this JSON body. The saved record uses longer names: `symbol` becomes `stockSymbol` and `quantity` becomes `shareQuantity`. The full field list is in the [data dictionary](../docs/03-system-design/data-dictionary.md#api-request-body).

```json
{ "symbol": "AAPL", "tradeType": "Buy", "quantity": 5, "orderType": "Market", "requestId": "3f2b8c1e-7a4d-4e0a-9b51-2c6d8e1f0a77" }
```

| Reply | When |
|---|---|
| 200 `{ status: "ACCEPTED", success: true, persisted: true, transactionId, trade, account }` | Accepted and saved together with the account change |
| 400 `{ status: "REJECTED", reason, success: false, persisted: true, transactionId, trade }` | Rejected by a rule; the Rejected record is saved |
| 500 `{ status: "ERROR", reason, success: false }` | The save failed. If the Rejected (System) record was saved, the reply also has `persisted: true` and its `transactionId` |

`GET /api/trades/{transactionId}` returns `{ success: true, trade }` for the owner (or an admin), and 404 "Trade not found." for anyone else or an unknown ID. A confirmation number typed in capitals is found too. A request to an address the Lambda does not know gets 404 "Not found."; a known address with the wrong method gets 405.

## Run it on your computer (no AWS needed)

```
cd aws/lambda
npm install
npm start
```

Open http://localhost:3000. The website is served from `frontend/`, and every trade goes through the real `index.js` handler, exactly as on AWS. DynamoDB is replaced by in-memory tables, so saved trades and the account reset when you stop the server with Ctrl+C. Each request prints its log line in the terminal. On `localhost`, `frontend/app.js` sends trades to this local server; on the Amplify site it uses AWS.

## AWS setup for account balances (BR-7)

Account balances need these changes in the AWS account that hosts the backend, made once before uploading this version:

1. **DynamoDB → Create table:** name `MarketStreetAccounts`, partition key `userId` (String), on-demand capacity.
2. **Lambda → Configuration → Environment variables:** add `ACCOUNTS_TABLE = MarketStreetAccounts` (keep `TABLE_NAME = MarketStreetTrades`).
3. **Lambda permissions:** the role (`LabRole`) must allow `dynamodb:GetItem`, `PutItem`, `UpdateItem` and `TransactWriteItems` (needed for the combined save) on both tables.
4. **API Gateway → Routes:** add `GET /api/account` with the same Lambda integration. The frontend loads the balance from it.

The account is created automatically with $10,000 and no holdings (D-10) the first time it is used. Users reset it themselves on the Account page; admins can reset any account from the admin console.

## AWS setup for profiles, the admin console and the audit log

These run entirely on DynamoDB, so no extra IAM permissions for Cognito are needed. Once, before uploading this version:

1. **DynamoDB → Create tables** (on-demand): `MarketStreetUsers` (partition key `userId`, String) and `MarketStreetAudit` (partition key `auditId`, String).
2. **Lambda → Environment variables:** add `USERS_TABLE = MarketStreetUsers` and `AUDIT_TABLE = MarketStreetAudit`.
3. **Lambda permissions:** `LabRole` must allow `dynamodb:GetItem`, `PutItem` and `Scan` on both new tables, and `Scan` on the trades, accounts and games tables (the admin console reads them). Also allow `dynamodb:Query` on the two indexes from step 6 (`.../table/MarketStreetTrades/index/*` and `.../table/MarketStreetGames/index/*`).
4. **API Gateway → Routes** (same Lambda integration and JWT authorizer): `GET /api/trades`, `GET /api/quotes`, `GET /api/me`, `PATCH /api/me`, `POST /api/me/sign-out-everywhere`, `POST /api/account/reset`, `GET /api/admin/overview`, `GET /api/admin/users`, `GET /api/admin/users/{userId}`, `POST /api/admin/users/{userId}/actions`, `GET /api/admin/trades`, `GET /api/admin/audit`.
5. **API Gateway → CORS:** add `PATCH` to the allowed methods and `authorization` to the allowed headers. The full production setting is in [Production setup](#production-setup-live-site-nov-2026).
6. **DynamoDB → Indexes** (projection ALL): on the trades table add `userId-submittedAt-index` (partition `userId`, sort `submittedAt`, both String); on the games table add `ownerId-updatedAt-index` (partition `ownerId`, sort `updatedAt`, both String). Override the names with the `TRADES_USER_INDEX` and `GAMES_OWNER_INDEX` environment variables if needed.
7. **DynamoDB → Backups:** turn on point-in-time recovery for all six tables (trades, accounts, games, users, audit, learn). Check it in the console; this README cannot confirm that it is on.

How it works ([backend/users.js](lambda/backend/users.js), [backend/admin.js](lambda/backend/admin.js)):

- Every request loads the user's profile. A **disabled** user gets 403 on everything; **sign out everywhere** refuses any token issued before it (401), even if the token hasn't expired.
- A role set by an admin in the console wins over the Cognito `admins` group. The first admin still comes from the Cognito group.
- Every `/api/admin/*` route checks the role on the server. A refusal is written to the audit log as `authz.denied`.
- Admins can't disable or demote themselves, and the last admin can't be removed.
- Rejected trades are now saved with `rejectionReason` and `rejectionCategory` (FR-4, BR-8). Nothing else changes.
- Every account and admin action writes an audit entry: who, what, target, before → after and an optional reason. Entries are only ever added.
- `GET /api/trades`, `GET /api/me` and a user's admin page read through the indexes. The admin overview, users list, trades list and audit still use `Scan`, which is fine at class scale.

## AWS setup for Scenario Mode games

Scenario Mode saves each game on the server. Once, before uploading this version:

1. **DynamoDB → Create table:** name `MarketStreetGames`, partition key `gameId` (String), on-demand capacity.
2. **Lambda → Configuration → Environment variables:** add `GAMES_TABLE = MarketStreetGames`.
3. **Lambda permissions:** `LabRole` must allow `dynamodb:GetItem` and `PutItem` on `MarketStreetGames`. Nothing else is needed for games (least privilege).
4. **API Gateway → Routes:** add these five routes, all with the same Lambda integration:

   | Route | Does |
   |---|---|
   | `POST /api/games` | Starts a game in a scenario |
   | `GET /api/games/{gameId}` | Loads a saved game (used to resume after a refresh) |
   | `POST /api/games/{gameId}/orders` | Buy or Short an amount of a stock |
   | `POST /api/games/{gameId}/close` | Closes all or half of a position |
   | `POST /api/games/{gameId}/advance` | Ends the trading day (or every day up to `untilDay`); the bot trades at each close |

5. **API Gateway → CORS:** `GET` and `POST` are needed (already set for trades). The full production setting is in [Production setup](#production-setup-live-site-nov-2026).

How a game stays trustworthy (see [backend/games.js](lambda/backend/games.js)):

- The rules are in [backend/game-core.js](lambda/backend/game-core.js). The page uses a copy of the same file for previews (`npm run sync-core` copies it to `frontend/`; a test fails if the copies differ). The server's copy decides.
- The server sets the game ID, the times, every price and every trade record. A price sent by the browser is ignored.
- Every action carries a `requestId`. The same `requestId` twice is applied once (a retried click or a lost reply).
- Every save checks the game's `version`, so two requests at the same time can't overwrite each other.
- If the save fails, the reply says nothing was saved; the details go to CloudWatch only.

Tests: `cd aws/lambda && npm ci && npm test` runs every test file in `tests/` (94 tests in 9 files on Nov 27), including the game rules and the `/api/games` routes, against the in-memory DynamoDB from `local-server.js`.

## Sign-in and roles (Amazon Cognito)

Every route needs a signed-in user, except the Learn quiz routes (`/api/learn/...`), which are public. MarketStreet's own sign-in page (`frontend/signin.html`) sends the email and password straight to Cognito over HTTPS, so MarketStreet's servers never receive a password.

| Piece | Setting |
|---|---|
| User pool | `MarketStreetUsers` (`us-east-1_Bc2WPM5AD`): sign in with email, self sign-up, email verification, passwords of 10+ characters with upper case, lower case and a number |
| Group | `admins`: may see every player's games (`GET /api/admin/games`) and read any trade. Everyone else is a trader. |
| App client | `MarketStreetWeb` (`39ufd4fucor0jpnhklpdqdo8lh`): public (no secret), with `ALLOW_USER_PASSWORD_AUTH` and `ALLOW_REFRESH_TOKEN_AUTH`. Display names use the standard `nickname` attribute. |
| API Gateway | JWT authorizer `CognitoLogin`: issuer `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_Bc2WPM5AD`, audience = the app client ID (`39ufd4fucor0jpnhklpdqdo8lh`), identity source `$request.header.Authorization`. Attached to every route except the public Learn routes. |

How it works:

1. `frontend/auth.js` sends a user who is not signed in to `signin.html`. There they sign in, create an account (Cognito emails a 6-digit code) or reset a forgotten password; `signin.js` calls Cognito's API directly. The ID token Cognito returns is kept in `sessionStorage`.
2. Every API request sends `Authorization: Bearer <ID token>`. API Gateway checks the token's signature and expiry before the Lambda runs (401 if it is missing or wrong).
3. The Lambda reads the user from the checked token ([backend/auth.js](lambda/backend/auth.js)). Each user has their own account (keyed by the token's `sub`). A game belongs to the user who started it: another user gets 403, and an admin may look at it but not play it. The admin check happens in the Lambda, so hiding the Admin link is not the only protection.

To make someone an admin: they sign up first, then **Cognito → User pools → MarketStreetUsers → Groups → admins → Add user** (or `aws cognito-idp admin-add-user-to-group --user-pool-id us-east-1_Bc2WPM5AD --username <email> --group-name admins`). They see the change after signing in again.

**Leaderboard:** `GET /api/leaderboard?scenario=<id>` returns the best finished game of each player in one scenario, ranked by return. It shows display names only, never emails.

On your computer, `local-server.js` reads the token from the `Authorization` header but does **not** check its signature (only API Gateway can). Sign in on `http://localhost:3000` with a real Cognito account. All six tables are kept in memory, so they start empty each time the server starts.

## Production setup (live site, Nov 2026)

The live site (`https://main.d2kb3xv6llewil.amplifyapp.com`) uses API `59w9sz4rrl`, Lambda `MarketStreet-ProcessTrade`, user pool `us-east-1_Bc2WPM5AD` and app client `39ufd4fucor0jpnhklpdqdo8lh` (set in `frontend/app.js` and `frontend/auth.js`). `frontend/app.js` also checks the hostname: only the `cognito-login` and `platform-redesign` branch previews use the separate test API `qedu5ta2jc` (`MarketStreet-API-test`). On `localhost` the site calls the local server.

| Piece | Production setting |
|---|---|
| Routes | `GET /api/{proxy+}`, `POST`, `PUT`, `PATCH` and `DELETE /api/{proxy+}`, plus the named trade, account, games and admin routes. All use the JWT authorizer `CognitoLogin` (`34uch9`). |
| Public routes | `GET /api/learn/{proxy+}` and `POST /api/learn/{proxy+}` have no authorizer. The Learn quiz needs no sign-in, and the server scores it. |
| CORS (API Gateway) | Allowed origin: the Amplify site. Methods `GET, POST, PUT, PATCH, DELETE` (API Gateway answers `OPTIONS` itself); headers `content-type, authorization`. This is the setting browsers see. |
| CORS (Lambda) | `index.js` also adds its own headers to every reply: `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: Content-Type,Authorization`, `Access-Control-Allow-Methods: GET,POST,PATCH,OPTIONS`. They matter for the local server and Lambda console tests. When API Gateway CORS is set, API Gateway uses its own CORS setting instead. |
| Lambda permission | A resource policy statement `apigw-all-api` lets API Gateway call the Lambda for `/*/*/api/*`. Without it, any route not listed by name returns 500. |
| Environment variables | `TABLE_NAME`, `ACCOUNTS_TABLE`, `GAMES_TABLE`, `USERS_TABLE`, `AUDIT_TABLE`, `LEARN_TABLE` |
| Indexes | `MarketStreetTrades`: `userId-submittedAt-index`. `MarketStreetGames`: `ownerId-updatedAt-index`. |

**The AWS Learner Lab must be running.** When the lab stops, the Lambda role stops working and every request fails with "Something went wrong". Starting the lab again fixes it. Nothing needs to be redeployed.

**Learn quiz** ([backend/learn.js](lambda/backend/learn.js)): `GET /api/learn/questions` (no answers), `POST /api/learn/start`, `POST /api/learn/answer`, `POST /api/learn/finish`. These routes are public (no sign-in). The server notes the start time, re-checks every answer and saves the run once in `MarketStreetLearn` (partition key `runId`, String; Lambda environment variable `LEARN_TABLE`).

**Weekly League** (`frontend/league.html`) is a single-player demo that runs in the browser. It stores its state in `localStorage` and does not call the API.

## Deploy a change

The Lambda is **not** connected to GitHub. Pushing to `main` does not update it.

1. Try the change locally (`npm start`) and merge it through a pull request.
2. AWS Console → Lambda → `MarketStreet-ProcessTrade` → **Code** → **Download** to back up the current version.
3. Upload `index.js` and the whole `backend/` folder (for example as a zip: `cd aws/lambda && zip -r ~/Desktop/marketstreet-lambda.zip index.js backend`) and click **Deploy**. Do not upload `node_modules`; the AWS SDK is built into the runtime.
4. Check it with the Lambda **Test** tab, then place a trade on the live site.

Full setup details and test results: [Testing/Week-11-DynamoDB/README.md](../Testing/Week-11-DynamoDB/README.md).
