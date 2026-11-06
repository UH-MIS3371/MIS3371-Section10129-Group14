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

## Deploy a change

The Lambda is **not** connected to GitHub. Pushing to `main` does not update it.

1. Try the change locally (`npm start`) and merge it through a pull request.
2. AWS Console → Lambda → `MarketStreet-ProcessTrade` → **Code** → **Download** to back up the current version.
3. Upload `index.js` and the whole `backend/` folder (for example as a zip: `cd aws/lambda && zip -r ~/Desktop/marketstreet-lambda.zip index.js backend`) and click **Deploy**. Do not upload `node_modules`; the AWS SDK is built into the runtime.
4. Check it with the Lambda **Test** tab, then place a trade on the live site.

Full setup details and test results: [Testing/Week-11-DynamoDB/README.md](../Testing/Week-11-DynamoDB/README.md).
