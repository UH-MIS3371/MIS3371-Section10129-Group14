# Week 12 — Security, Privacy & System Controls

How the Week 12 controls apply to MarketStreet, using Scenario Mode games (`/api/games`) as the example. Each row names where the control lives and the test that checks it ([aws/lambda/tests/games.test.js](../../aws/lambda/tests/games.test.js), run with `cd aws/lambda && npm test`).

## Controls in the application

| Control (lecture) | What MarketStreet does | Where | Test |
|---|---|---|---|
| **The browser helps, the backend decides** | The page uses the rules to preview an order and disable the button, but the Lambda applies the same rules again and its answer is the official one. | `frontend/game-core.js` (preview), `aws/lambda/backend/game-core.js` (official) | "order rules…", "the browser and Lambda copies… are identical" |
| **Official values belong on the server** | The server creates the game ID, the times, every price and every trade record. Cash, prices or IDs sent by the browser are ignored. | `backend/games.js` `createGame`, `ACTIONS` | "starting a game: the server sets the ID, times, cash and day", "an order is priced by the server, not the browser" |
| **Idempotency: two clicks, one transaction** | Every action carries a `requestId` (a UUID made by the browser). The server remembers the last 20 per game; the same `requestId` again returns the saved game without applying the action twice. The page retries a lost request with the same `requestId`. | `backend/games.js` `act`, `frontend/scenarios.js` `act` | "the same requestId twice saves one order (idempotency)" |
| **No lost updates** | Each save only succeeds if the game still has the `version` that was read (DynamoDB `ConditionExpression`). Two requests at the same moment are both applied, one after the other. | `backend/games.js` `save`, `act` | "two different orders at the same moment are both kept" |
| **Validate input, apply business rules** | Whole shares of 1 or more, enough cash, one direction per stock, shorts no bigger than the account, orders only on the game's current day, time can't go backwards, at most 1,000 orders per game. | `backend/game-core.js` `orderPlan`, `backend/games.js` `atCurrentMoment` | "orders must be for the current day; progress can't go backwards", "bad requests get clear errors" |
| **No successful write = no confirmation** | The page only changes when the server confirms the save. If the save fails the player sees "Your action was NOT saved. Please try again." and the game is unchanged. | `backend/games.js` `handleGames`, `frontend/scenarios.js` `act`, `applyServer` | "a database failure says the action was NOT saved and leaks no internals" |
| **Safe error messages** | Invalid requests say what to fix. Database errors return a general message; the real error is written only to CloudWatch Logs. | `backend/games.js` `fail`, `handleGames` | same as above |
| **Operational log** | One JSON line per request in CloudWatch, now with `gameId` and `gameDay`. Request bodies are never logged. | `aws/lambda/index.js` `logRequest` | — |
| **Least privilege** | Games need only `GetItem` and `PutItem` on one table (`MarketStreetGames`). | [aws/README.md](../../aws/README.md) | — |
| **Collect only what is needed** | A game stores the scenario, cash, positions, trades and daily values. It also stores the owner's Cognito ID, email (for admins) and the display name they chose; the leaderboard shows only the display name. | `backend/game-core.js` `newGame` | — |
| **Encryption in transit and at rest** | API Gateway and Amplify use HTTPS; DynamoDB encrypts tables at rest by default. | AWS configuration | — |

## Sign-in and roles (Amazon Cognito)

| Control (lecture) | What MarketStreet does | Where | Test |
|---|---|---|---|
| **Authentication: who are you?** | Users sign in on MarketStreet's sign-in page, which sends the password straight to Amazon Cognito over HTTPS; MarketStreet's servers never receive it. API Gateway's JWT authorizer checks the token on every route before the Lambda runs. | `frontend/auth.js`, API Gateway authorizer `CognitoLogin` | "every route needs a signed-in user" |
| **Authorization: what may you do?** | Each user has their own account. A game belongs to its player: another user gets 403. Members of the `admins` group may see every game but may not play another player's game. | `backend/auth.js`, `backend/games.js`, `index.js` `getTrade` | "each user has their own account", "a game belongs to its player…", "only admins can list every game" |
| **Hiding a button is not protection** | Only admins see the Admin link, but the Lambda also checks the group and answers 403 to everyone else. | `backend/games.js` `listGames`, `frontend/admin.js` | "only admins can list every game" |
| **Official values on the server** | The user ID and email come from the checked token, never from the request body. | `backend/games.js` `createGame`, `index.js` `postTrade` | "a game belongs to its player…" |

## Not in the application (known limitations)

| Control (lecture) | Status |
|---|---|
| **MFA** | Not turned on. Cognito supports it; the sign-in page would need a step for the authenticator code. |
| **Password never sent** | The password travels to Cognito over HTTPS. Cognito's SRP sign-in would avoid sending it at all, but needs a cryptography library in the page. |
| **Local sign-in check** | On a developer's computer, `local-server.js` reads the token without checking its signature; only API Gateway checks signatures. |
| **Look-ahead in Scenario Mode** | The page still downloads the whole price history to draw charts, so a player could look at future prices in the browser's developer tools. The server owns the prices and the score, but it does not hide the future. Hiding it would mean sending each day's prices only after the day ends. |
| **Audit trail (CloudTrail)** | Not set up for this project; the saved trades and the CloudWatch log are the evidence kept. |
