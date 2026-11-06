# MarketStreet on AWS

This folder holds the live MarketStreet backend. The website in [`frontend/`](../frontend/) sends every trade here.

| AWS service | Name | Job |
|---|---|---|
| Amplify | MarketStreet site | Hosts `frontend/` (see [`amplify.yml`](../amplify.yml)) |
| API Gateway (HTTP API) | `MarketStreet-API` | Public address: `https://59w9sz4rrl.execute-api.us-east-1.amazonaws.com/api/trades` |
| Lambda | `MarketStreet-ProcessTrade` | Runs the code in [`lambda/`](lambda/) |
| DynamoDB | `MarketStreetTrades` | Stores accepted trades, keyed by `transactionId` |
| CloudWatch Logs | `/aws/lambda/MarketStreet-ProcessTrade` | One JSON log line per request |

All resources are in `us-east-1`.

## What is in `lambda/`

| File | Purpose |
|---|---|
| [`index.js`](lambda/index.js) | Entry point (`index.handler`). Routes `POST /api/trades` and `GET /api/trades/{transactionId}`, saves to DynamoDB, writes logs. |
| [`backend/trades.js`](lambda/backend/trades.js) | Business rules: `validateTrade()` accepts or rejects a trade. |
| [`backend/market-data.js`](lambda/backend/market-data.js) | Simulated prices and the fixed starting account. Prices must match `frontend/data.js`. |
| [`tests/test-lambda.js`](lambda/tests/test-lambda.js) | Automated tests (in-memory database locally, or the live API with `API_URL`). |

## Test

```
cd aws/lambda
npm install
npm test
```

## Deploy a change

The Lambda is **not** connected to GitHub. Pushing to `main` does not update it.

1. Test the change locally (`npm test`) and merge it through a pull request.
2. AWS Console → Lambda → `MarketStreet-ProcessTrade` → **Code** → **Download** to back up the current version.
3. Replace the changed files (`index.js`, `backend/trades.js`, `backend/market-data.js`) with the versions from this folder and click **Deploy**. Do not upload `node_modules`; the AWS SDK is built into the runtime.
4. Check it with the Lambda **Test** tab or `API_URL=https://59w9sz4rrl.execute-api.us-east-1.amazonaws.com/api/trades node aws/lambda/tests/test-lambda.js` (this saves real test trades).

Full setup details and test results: [Testing/Week-11-DynamoDB/README.md](../Testing/Week-11-DynamoDB/README.md).
