# MarketStreet — Three-Tier Architecture

**Presentation collects and displays. Application logic validates and decides. Data stores the official records.**

```mermaid
flowchart TB
    subgraph PRESENTATION["TIER 1 - PRESENTATION / BROWSER"]
        UI["`**Collect**
Stock symbol · Buy or Sell
Share quantity · Market order

**Display**
Price · Errors · Trade result
Portfolio · History`"]
    end

    subgraph APPLICATION["TIER 2 - APPLICATION LOGIC / BACKEND"]
        APP["`**Validate**
Signed-in account · Trade input
Price · Cash · Shares

**Process**
Execution price · Trade value
Atomic commit · Rollback

**Create**
ID · Status · Reason · Timestamps`"]
    end

    subgraph DATA["TIER 3 - DATA / DATABASE"]
        DB[("`**Store account data**
Accounts · Cash · Holdings

**Store trade records**
ID · Input · Execution values
Status · Reason · Category · Timestamps`")]
    end

    subgraph AWS["AWS SERVICES BEHIND TIER 2 AND 3"]
        COG["Amazon Cognito<br/>sign-in, group admins"]
        APIGW["API Gateway HTTP API<br/>JWT authorizer"]
        LAM["Lambda (Node.js)<br/>one function, all routes"]
        TBL[("DynamoDB tables<br/>Trades, Accounts, Games<br/>Users, Audit")]
    end

    PRICE["`**Price source**
Simulated stock prices
Fixture or market data provider`"]

    UI -- "Trade request" --> APP
    APP -- "Saved result" --> UI
    APP -- "Read records / save trade" --> DB
    DB -- "Records / save confirmation" --> APP
    APP -. "Look up symbol" .-> PRICE
    PRICE -. "Price or unavailable" .-> APP

    UI -. "Sign in" .-> COG
    UI -. "HTTPS + token" .-> APIGW
    APIGW -.-> LAM
    LAM -.-> TBL

    classDef presentation fill:#dbeafe,stroke:#2563eb,color:#0f172a,stroke-width:2px
    classDef application fill:#dcfce7,stroke:#16a34a,color:#0f172a,stroke-width:2px
    classDef data fill:#f1f5f9,stroke:#64748b,color:#0f172a,stroke-width:2px
    classDef dependency fill:#f6f8fa,stroke:#57606a,color:#24292f,stroke-dasharray:5 5
    class UI presentation
    class APP application
    class DB data
    class PRICE dependency
```

Only the application accesses the database. The price source supplies the application with prices; it is a dependency outside the three tier boxes. Prices from the price source are never taken from the browser, so the user cannot choose their own execution price (BR-9).

**Implementation status:** This is the built architecture. The [static frontend](../../frontend/index.html) is hosted on AWS Amplify. Users sign in with Amazon Cognito (group `admins` grants the admin role). The browser calls an API Gateway HTTP API whose JWT authorizer checks the token, and a single Node.js Lambda validates, executes and saves every trade. Data lives in five DynamoDB tables: `MarketStreetTrades` (transactionId), `MarketStreetAccounts` (userId), `MarketStreetGames` (gameId), `MarketStreetUsers` (userId: profile, role, disabled, tokensValidAfter) and `MarketStreetAudit` (auditId). Planned indexes: trades by `userId` + `submittedAt`, games by `ownerId` + `updatedAt`. Earlier browser-only interfaces that offer Limit orders are preserved as [archived coursework](../../archive/README.md).

## Why Lambda instead of EC2

Trade processing is short, request-driven work: a request arrives, the code runs for milliseconds, and it stops. Lambda has no operating system or server to patch, scales with the number of requests, and bills per request. EC2 suits long-running applications that need control of the operating system, which MarketStreet does not.

## Availability vs backup and recovery

These are different problems. **Availability** means the system keeps working: the managed multi-AZ services (Lambda, API Gateway, DynamoDB, Cognito) keep running if one data center fails. **Backup and recovery** means getting data back after a mistake: DynamoDB point-in-time recovery restores deleted or damaged records to an earlier moment. The application never deletes records (NFR-4), so recovery is only needed for operator error or damage outside the application.

Details: [Trade workflow](workflow.md) · [Data dictionary](data-dictionary.md) · [Trade states](state-diagram.md) · [Responsibility notes](short-responsibility-notes.md).
