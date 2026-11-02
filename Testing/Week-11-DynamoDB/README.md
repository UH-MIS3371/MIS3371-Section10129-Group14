# Week 11 — Saving Trades to DynamoDB

Accepted trades are now saved to Amazon DynamoDB, and a saved trade can be read back by its `transactionId`.

## What changed

| Piece | Change |
|---|---|
| [lambda/index.js](../../lambda/index.js) | POST validates with the unchanged `validateTrade()`, then saves accepted trades with `PutCommand`. New GET route reads one trade with `GetCommand`. |
| [lambda/backend/](../../lambda/backend/) | Unchanged. All business rules still live in `trades.js`. |
| [lambda/tests/test-lambda.js](../../lambda/tests/test-lambda.js) | Checks that accepted trades are saved, rejected trades are not, and GET returns the saved record. |
| [frontend/trade.js](../../frontend/trade.js) | The success message now shows the saved transaction ID. |

## How it works

- **`index.js`** receives the API Gateway request, decides POST or GET, and returns the HTTP response.
- **`backend/trades.js`** still decides whether a trade is accepted or rejected (BR-1 to BR-5, BR-9). `index.js` reuses it so the business rules stay in one place.
- **`PutCommand`** writes one record (item) to the DynamoDB table. A condition (`attribute_not_exists(transactionId)`) makes sure an existing record is never overwritten.
- **`GetCommand`** reads one record by its partition key, `transactionId`.
- **`persisted: true`** is only returned after DynamoDB confirms the save. If the save fails, the API returns HTTP 500 with `persisted: false` and a general message; the real error is only written to CloudWatch Logs.
- **Rejected trades are not saved.** They return HTTP 400 before the database is used. (The data dictionary describes a record for every trade, including rejected ones; this week's assignment only saves valid trades.)
- **The server builds the record.** `transactionId` (`crypto.randomUUID()`), `submittedAt`, `status`, `executionPrice` and `transactionValue` all come from the Lambda. Any ID, status, time, price, cash or shares sent by the browser are ignored.
- **The account does not change yet.** Cash and share checks still use the fixed starting account in `market-data.js`.

### Saved record

Field names follow the [data dictionary](../../docs/03-system-design/data-dictionary.md).

```json
{
  "transactionId": "89300543-6517-4f55-bf13-3307d81f8116",
  "stockSymbol": "AAPL",
  "tradeType": "Buy",
  "shareQuantity": 1,
  "orderType": "Market",
  "executionPrice": 185.5,
  "transactionValue": 185.5,
  "status": "Accepted",
  "submittedAt": "2026-11-02T22:36:52.434Z"
}
```

### API

| Request | Result |
|---|---|
| `POST /api/trades` (valid) | 200 `{ status: "ACCEPTED", message, success: true, persisted: true, transactionId, submittedAt }` |
| `POST /api/trades` (invalid) | 400 `{ status: "REJECTED", reason, success: false, persisted: false }` and nothing is saved |
| `POST /api/trades` (save failed) | 500 `{ status: "ERROR", reason, success: false, persisted: false }` |
| `GET /api/trades/{transactionId}` | 200 `{ success: true, trade: { ...saved record } }` |
| GET, unknown or non-UUID ID | 404 `{ success: false, reason: "Trade not found." }` |
| GET, missing ID | 400 · database error: 500 |

## AWS setup (us-east-1)

| Resource | Setting |
|---|---|
| DynamoDB table | `MarketStreetTrades`, partition key `transactionId` (String), on-demand capacity |
| Lambda | `MarketStreet-ProcessTrade`, Node.js 24.x, handler `index.handler`, role `LabRole`, timeout 10 s |
| Environment variable | `TABLE_NAME = MarketStreetTrades` |
| API Gateway | `MarketStreet-API` (`59w9sz4rrl`), routes `POST /api/trades` and `GET /api/trades/{transactionId}`, both using the same Lambda integration (payload 2.0) |
| Lambda permission | API Gateway may invoke the Lambda for `/api/trades` and `/api/trades/*` |
| CORS (API Gateway) | Origin `https://main.dpq307ec2nc5x.amplifyapp.com`, methods `GET, POST`, header `content-type` |

## Deployment checklist

1. Back up the current code: Lambda → **Code** → **Download** (`.zip`). The code before this change is also tagged `backup/pre-week-11` in git.
2. DynamoDB → **Tables**: `MarketStreetTrades` exists with partition key `transactionId` (String).
3. Lambda → **Configuration** → **Environment variables**: `TABLE_NAME = MarketStreetTrades`.
4. Lambda → **Configuration** → **Permissions**: role is `LabRole` (in the AWS Academy lab it already allows `dynamodb:PutItem` and `dynamodb:GetItem`).
5. Lambda → **Code**: `backend/trades.js` and `backend/market-data.js` are present. The AWS SDK v3 is built into the Node.js runtime, so no `node_modules` folder is uploaded.
6. API Gateway → **Routes**: `POST /api/trades` and `GET /api/trades/{transactionId}` both point to `MarketStreet-ProcessTrade`.
7. API Gateway → **CORS**: allowed methods include `GET` and `POST`.
8. Replace `index.js` with [lambda/index.js](../../lambda/index.js) and click **Deploy**.

## Lambda console tests

Lambda → **Test** → **Create new event**, paste the JSON, then **Test**.

| Event | Expected | Actual (2026-11-02) |
|---|---|---|
| [post-valid.json](events/post-valid.json): Buy 2 AAPL | 200, `ACCEPTED`, `persisted: true`, new `transactionId`; the record appears in DynamoDB → **Explore items** | Pass |
| [get-by-id.json](events/get-by-id.json): change the ID in `pathParameters` and both paths to the `transactionId` returned by POST | 200, `success: true`, the same record | Pass |
| [post-invalid.json](events/post-invalid.json): Sell 11 AAPL (only 10 owned) | 400, `REJECTED`, `Insufficient shares.`, `persisted: false`; the item count in DynamoDB does not change | Pass (8 records before and after) |

## Automated tests

```
cd lambda
npm install
npm test
```

Runs 46 checks locally with an in-memory table instead of DynamoDB. These cover the original 24 business-rule cases, saving and GET, database failures, a missing `TABLE_NAME`, and ignored browser fields.

To run the same cases against the deployed API (it writes a few fictional trades to the table):

```
API_URL=https://59w9sz4rrl.execute-api.us-east-1.amazonaws.com/api/trades node lambda/tests/test-lambda.js
```

Results on 2026-11-02: **46/46 local** and **29/29 against the live API**. The live run added 6 records to the table, one for each accepted trade (5 business-rule cases and the GET round trip). None of the 19 rejected cases were saved.
