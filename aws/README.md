# MarketStreet on AWS

This folder holds the live MarketStreet backend. The website in [`frontend/`](../frontend/) sends every trade here.

| AWS service | Name | Job |
|---|---|---|
| Amplify | MarketStreet site | Hosts `frontend/` (see [`amplify.yml`](../amplify.yml)) |
| API Gateway (HTTP API) | `MarketStreet-API` | Public address: `https://59w9sz4rrl.execute-api.us-east-1.amazonaws.com/api/trades` |
| Lambda | `MarketStreet-ProcessTrade` | Runs the code in [`lambda/`](lambda/) |
| DynamoDB | `MarketStreetTrades` | Stores accepted trades, keyed by `transactionId` |
| DynamoDB | `MarketStreetAccounts` | Stores the account's cash and holdings, keyed by `userId` (BR-7) |
| CloudWatch Logs | `/aws/lambda/MarketStreet-ProcessTrade` | One JSON log line per request |

All resources are in `us-east-1`.

## What is in `lambda/`

| File | Purpose |
|---|---|
| [`index.js`](lambda/index.js) | Entry point (`index.handler`). Routes `POST /api/trades`, `GET /api/trades/{transactionId}` and `GET /api/account`, and writes logs. |
| [`backend/trades.js`](lambda/backend/trades.js) | Business rules: `validateOrder()` (BR-1–3, BR-6, BR-9) and `checkAccount()` (BR-4, BR-5). |
| [`backend/accounts.js`](lambda/backend/accounts.js) | Reads the account and saves an accepted trade together with the cash and holdings change in one DynamoDB transaction (BR-7), re-checking cash or shares inside it. |
| [`backend/market-data.js`](lambda/backend/market-data.js) | Simulated prices (`getQuote()`, with the BR-6 15-minute limit) and the starting account. Prices must match `frontend/data.js`. |
| [`local-server.js`](lambda/local-server.js) | Runs the Lambda and the website on your computer, with an in-memory stand-in for DynamoDB. Not uploaded to AWS. |

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

The account is created automatically with $10,000 and 10 AAPL, 2 MSFT, 1 IBM the first time it is used. To reset it, delete the `demo` item in `MarketStreetAccounts`.

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

5. **API Gateway → CORS:** allowed methods `GET, POST`, header `content-type` (already set for trades).

How a game stays trustworthy (see [backend/games.js](lambda/backend/games.js)):

- The rules are in [backend/game-core.js](lambda/backend/game-core.js). The page uses a copy of the same file for previews (`npm run sync-core` copies it to `frontend/`; a test fails if the copies differ). The server's copy decides.
- The server sets the game ID, the times, every price and every trade record. A price sent by the browser is ignored.
- Every action carries a `requestId`. The same `requestId` twice is applied once (a retried click or a lost reply).
- Every save checks the game's `version`, so two requests at the same time can't overwrite each other.
- If the save fails, the reply says nothing was saved; the details go to CloudWatch only.

Tests: `cd aws/lambda && npm install && npm test` runs the rules and the `/api/games` routes against the in-memory DynamoDB from `local-server.js`.

## Sign-in and roles (Amazon Cognito)

Every route needs a signed-in user. MarketStreet's own sign-in page (`frontend/signin.html`) sends the email and password straight to Cognito over HTTPS, so MarketStreet's servers never receive a password.

| Piece | Setting |
|---|---|
| User pool | `MarketStreetUsers` (`us-east-1_Bc2WPM5AD`): sign in with email, self sign-up, email verification, passwords of 10+ characters with upper case, lower case and a number |
| Group | `admins`: may see every player's games (`GET /api/admin/games`) and read any trade. Everyone else is a trader. |
| App client | `MarketStreetWeb` (`39ufd4fucor0jpnhklpdqdo8lh`): public (no secret), with `ALLOW_USER_PASSWORD_AUTH` and `ALLOW_REFRESH_TOKEN_AUTH`. Display names use the standard `nickname` attribute. |
| Login page | `https://marketstreet-g14-ig7886.auth.us-east-1.amazoncognito.com` |
| API Gateway | JWT authorizer `CognitoLogin`: issuer `https://cognito-idp.us-east-1.amazonaws.com/us-east-1_Bc2WPM5AD`, audience = the app client ID, identity source `$request.header.Authorization`. Attached to every route. |

How it works:

1. `frontend/auth.js` sends a user who is not signed in to `signin.html`. There they sign in, create an account (Cognito emails a 6-digit code) or reset a forgotten password; `signin.js` calls Cognito's API directly. The ID token Cognito returns is kept in `sessionStorage`.
2. Every API request sends `Authorization: Bearer <ID token>`. API Gateway checks the token's signature and expiry before the Lambda runs (401 if it is missing or wrong).
3. The Lambda reads the user from the checked token ([backend/auth.js](lambda/backend/auth.js)). Each user has their own account (keyed by the token's `sub`). A game belongs to the user who started it: another user gets 403, and an admin may look at it but not play it. The admin check happens in the Lambda, so hiding the Admin link is not the only protection.

To make someone an admin: they sign up first, then **Cognito → User pools → MarketStreetUsers → Groups → admins → Add user** (or `aws cognito-idp admin-add-user-to-group --user-pool-id us-east-1_Bc2WPM5AD --username <email> --group-name admins`). They see the change after signing in again.

**Leaderboard:** `GET /api/leaderboard?scenario=<id>` returns the best finished game of each player in one scenario, ranked by return. It shows display names only, never emails.

On your computer, `local-server.js` reads the token from the `Authorization` header but does **not** check its signature (only API Gateway can). Sign in on `http://localhost:3000` with a real Cognito account.

**Testing on the `cognito-login` branch:** the branch preview (`https://cognito-login.d2kb3xv6llewil.amplifyapp.com`) uses a separate test API (`MarketStreet-API-test`, `qedu5ta2jc`) and Lambda (`MarketStreet-ProcessTrade-test`), so the live site is not affected until the branch is merged. When merging, add the JWT authorizer and the `GET /api/leaderboard` route to the live API, deploy the Lambda, and remove the test API line from `frontend/app.js`.

## Deploy a change

The Lambda is **not** connected to GitHub. Pushing to `main` does not update it.

1. Try the change locally (`npm start`) and merge it through a pull request.
2. AWS Console → Lambda → `MarketStreet-ProcessTrade` → **Code** → **Download** to back up the current version.
3. Upload `index.js` and the whole `backend/` folder (for example as a zip: `cd aws/lambda && zip -r ~/Desktop/marketstreet-lambda.zip index.js backend`) and click **Deploy**. Do not upload `node_modules`; the AWS SDK is built into the runtime.
4. Check it with the Lambda **Test** tab, then place a trade on the live site.

Full setup details and test results: [Testing/Week-11-DynamoDB/README.md](../Testing/Week-11-DynamoDB/README.md).
