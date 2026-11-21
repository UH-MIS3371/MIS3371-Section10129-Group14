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

    PRICE["`**Price source**
Simulated stock prices
Fixture or market data provider`"]

    UI -- "Trade request" --> APP
    APP -- "Saved result" --> UI
    APP -- "Read records / save trade" --> DB
    DB -- "Records / save confirmation" --> APP
    APP -. "Look up symbol" .-> PRICE
    PRICE -. "Price or unavailable" .-> APP

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

**Implementation status:** This is the proposed architecture. The [canonical interface](../../frontend/index.html) sends Market orders to the local Express backend for validation. Execution and persistent storage are still planned. Earlier browser-only interfaces that offer Limit orders are preserved as [archived coursework](../../archive/README.md).

Details: [Trade workflow](workflow.md) · [Data dictionary](data-dictionary.md) · [Trade states](state-diagram.md) · [Responsibility notes](short-responsibility-notes.md).
