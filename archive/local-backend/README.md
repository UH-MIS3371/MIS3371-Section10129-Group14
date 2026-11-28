# Week 8–9 local backend (retired)

> **Historical.** This folder is coursework evidence from Weeks 8 and 9. The live backend is the AWS Lambda in [`aws/lambda/`](../../aws/README.md). Nothing here runs on the live site. This page was moved out of the main README; it describes the system as it was in Week 9.

| Folder | What it is |
|---|---|
| [`server/`](server/) | The Week 9 Express server (`server.js`) and its API test (`test-api.js`) |
| [`backend/`](backend/) | The Week 8 business logic (`backend.js`) and its tests (`test-backend.js`) |

## Week 9 — Local API Setup (Session 1)

### Overview
In Week 9, MarketStreet used a local Express server to process stock trade requests through the Week 8 backend business logic.

Architecture: the browser (`frontend/`) sent a JSON request with `fetch()` to `POST /api/trades` on the Express server (`server/server.js`). The server called `processTrade()` in `backend/backend.js` and returned a JSON result (HTTP 200 ACCEPTED or HTTP 400 REJECTED).

### How to run the server locally

1. Install Node.js.
2. Open the project in VS Code.
3. Open a terminal in the main project folder.
4. Run these commands:

    cd archive/local-backend/server
    npm install
    npm start

The server runs at http://localhost:3000.

### API endpoint
`POST /api/trades`

The endpoint receives JSON transaction data and calls `processTrade()` from `backend/backend.js`.

### Endpoint test results

**Valid trade test**
- Buy 2 shares at $10 with $100 available.
- HTTP 200 OK
- Status: ACCEPTED

**Invalid trade test**
- Buy 0.5 shares (fractional quantity).
- HTTP 400 Bad Request
- Status: REJECTED
- Reason: Quantity must be a positive whole number.

### Notes
- Used the Week 8 business rules.
- Returned structured JSON responses.
- Ran locally without AWS or a database.

## Week 9 — Frontend and Backend Integration (Session 2)

### Overview
The MarketStreet trading interface was connected to the local Express server with JavaScript `fetch()`. Users could submit Buy and Sell orders in the browser, and the server processed them with the Week 8 `processTrade()` function.

### Frontend integration
- Kept the existing MarketStreet interface and styling.
- Added an asynchronous form submission handler using `fetch()`.
- Sent stock trade information as JSON to `POST /api/trades`.
- Showed backend acceptance and rejection messages.
- Handled connection errors when the server was unavailable.
- Blocked invalid share quantities before submission.

### Running the connected application
1. Open the project in VS Code.
2. Open the terminal.
3. Go to the server folder:

   cd archive/local-backend/server

4. Start the local server:

   npm start

5. Open the trading interface:

   http://localhost:3000/trade.html?symbol=AAPL

### Automated API tests
With the server running, open a second terminal in `archive/local-backend/server` and run:

   npm test

This runs `server/test-api.js`, which sends six JSON requests to `POST /api/trades` and compares the expected and actual results.

### Integration testing
Six integration tests were completed, covering:
- Valid Buy orders
- Insufficient shares
- Server connection failures
- Selling exactly the shares owned
- Insufficient cash
- Buying the maximum affordable shares

All six tests passed.

[View Week 9 test results and Network evidence](../../Testing/Week-9-Integration-Tests.md)

### Limitations in Week 9
The Week 9 server ran locally without AWS or a database. It validated trade requests but did not execute or save them. The AWS Lambda and DynamoDB replaced it in Weeks 10 and 11.

### Contributions
Based on the repository commit history, the Week 9 files (`server/server.js`, `server/package.json`, `server/test-api.js`, the frontend integration, and `Testing/Week-9-Integration-Tests.md` with its evidence screenshots) were committed by GitHub user smusetti-star (Sophia Musetti). The Week 8 backend (`backend/backend.js`) has commits from several team members.

### Session 2 contribution
Sophia Musetti:
- Connected the existing trading form to the local backend.
- Implemented asynchronous JSON requests and response handling.
- Added accepted, rejected, and connection-error feedback.
- Conducted six integration tests.
- Documented expected versus actual results and Network evidence.
