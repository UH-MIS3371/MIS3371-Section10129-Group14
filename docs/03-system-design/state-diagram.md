# MarketStreet — State Transition Diagram

A trade moves through four official states: **Submitted, Validated, Accepted, Rejected**. Only the final state, **Accepted** or **Rejected**, is saved to the database (D-19). Submitted and Validated are steps inside one Lambda call; they are never stored. **Draft** (dashed border) is shown for context only: it is the unsent form in the browser, it is not a status value, and it is never saved.

```mermaid
stateDiagram-v2
    direction TB

    state "Draft" as Draft
    state "Submitted" as Submitted
    state "Validated" as Validated
    state "Accepted" as Accepted
    state "Rejected" as Rejected

    Draft : browser only, not saved<br/>form errors are fixed here
    Submitted : transactionId assigned<br/>submittedAt set (not saved yet)
    Validated : executionPrice fixed<br/>validatedAt set (not saved yet)
    Accepted : FINAL, saved<br/>cash + holdings updated
    Rejected : FINAL, saved<br/>reason + category saved<br/>portfolio unchanged

    [*] --> Draft : user opens order form
    Draft --> Submitted : user submits a valid form
    Submitted --> Validated : all checks pass<br/>BR-1–6, BR-9
    Submitted --> Rejected : business rule fails [Rule]
    Validated --> Accepted : commit succeeds, BR-7
    Validated --> Rejected : re-check fails [Rule]<br/>system error [System]
    Accepted --> [*]
    Rejected --> [*]

    classDef draft fill:#f6f8fa,stroke:#57606a,color:#24292f,stroke-width:2px,stroke-dasharray:6 4
    classDef submitted fill:#dbeafe,stroke:#2563eb,color:#0f172a,stroke-width:2px
    classDef validated fill:#fef9c3,stroke:#a16207,color:#0f172a,stroke-width:2px
    classDef accepted fill:#dcfce7,stroke:#16a34a,color:#0f172a,stroke-width:2px
    classDef rejected fill:#fee2e2,stroke:#dc2626,color:#0f172a,stroke-width:2px
    class Draft draft
    class Submitted submitted
    class Validated validated
    class Accepted accepted
    class Rejected rejected
```

**How to read it:** each arrow is a transition, labeled with what causes it. `[Rule]` and `[System]` are the `rejectionCategory` saved with a Rejected trade. Accepted and Rejected are final, so both lead to the end marker; a corrected order starts over as a new transaction. The record is written once, when the trade reaches Accepted or Rejected, so the database never holds a Submitted or Validated record.

## Exception / Failure Paths

The following paths show how MarketStreet handles errors that interrupt the normal transaction flow. Exception 1 occurs before a transaction record exists. Exceptions 2, 3, and 4 occur after submission and result in the transaction entering the **Rejected** state.

```mermaid
flowchart LR
    E1(("1")):::num --> I1["Invalid form input<br/><i>in Draft</i>"]:::cause --> O1["Show error next to field<br/>nothing saved"]:::draft
    E2(("2")):::num --> I2["Business rule fails<br/><i>Submitted</i>"]:::cause --> O2["Rejected · Rule<br/>portfolio unchanged"]:::rejected
    E3(("3")):::num --> I3["Re-check fails in commit<br/><i>Validated</i>"]:::cause --> O3["Rejected · Rule<br/>portfolio unchanged"]:::rejected
    E4(("4")):::num --> I4["System error during commit<br/><i>Validated</i>"]:::cause --> O4["Nothing saved · Rejected · System<br/>portfolio unchanged"]:::rejected

    classDef num fill:#0b4f8a,stroke:#0b4f8a,color:#ffffff
    classDef cause fill:#fef9c3,stroke:#a16207,color:#0f172a
    classDef draft fill:#f6f8fa,stroke:#57606a,color:#24292f,stroke-dasharray:6 4
    classDef rejected fill:#fee2e2,stroke:#dc2626,color:#0f172a
```

| Exception | Happens at | Trigger | Result |
|---|---|---|---|
| **Exception 1 — Invalid Input** | **Draft** | The user enters invalid form data, such as an invalid trade type, stock symbol, or quantity (BR-1 to BR-3). | Display an error message. The order remains in **Draft** and nothing is saved. |
| **Exception 2 — Business Rule Validation Failure** | **Submitted → Rejected** | The application rejects the submitted trade during validation (BR-1 to BR-6, BR-9), such as insufficient cash, insufficient shares, an invalid or stale stock price, or a Limit order. | Set the status to **Rejected** with category **Rule** and a reason. Cash and holdings remain unchanged. |
| **Exception 3 — Re-check Fails Inside Commit** | **Validated → Rejected** | Between validation and commit, another order from the same account used the cash or shares. The commit is a DynamoDB conditional write, and its condition (enough cash or shares) fails. | Nothing from the commit is saved. Save the order as **Rejected** with category **Rule** and a reason. Cash and holdings remain unchanged. |
| **Exception 4 — System Error During Commit** | **Validated → Rejected** | A technical failure (for example, the database call fails) occurs while committing the validated trade (BR-7 / BR-8). | The DynamoDB transaction saves nothing. Save a separate **Rejected** record with category **System** and reply with HTTP 500. Cash and holdings keep their previous values. |

## States

| State | Where it lives | Saved? | Final? |
|---|---|---|---|
| **Draft** | Browser (the user's unsent order form) | No — no record, no transactionId | No |
| **Submitted** | Application (inside one Lambda call) | No — a processing step only | No |
| **Validated** | Application (inside one Lambda call) | No — a processing step only | No |
| **Accepted** | Application | Yes, in one transaction with the cash and holdings change | Yes |
| **Rejected** | Application | Yes, with the reason and category | Yes |

**Draft** has a dashed border because it exists only in the browser. Form errors (BR-1 to BR-3) keep the order in Draft until the user fixes them, so nothing is saved. Once the user submits, the application re-checks BR-1 to BR-3 because browser checks can be bypassed, and checks BR-4 to BR-6 and BR-9, which require application data. A corrected order after a rejection is a new transaction with a new transactionId; final records are never reopened.

## Business Rules on this Diagram

| Rule | Meaning | Where it appears |
|---|---|---|
| BR-1 | Trade type must be Buy or Sell | Draft (browser check), Submitted → Validated / Rejected |
| BR-2 | Stock symbol must be recognized | Draft (browser check), Submitted → Validated / Rejected |
| BR-3 | Share quantity must be a positive whole number | Draft (browser check), Submitted → Validated / Rejected |
| BR-4 | Enough simulated cash for a Buy | Submitted → Validated / Rejected; re-checked at Validated → Accepted / Rejected |
| BR-5 | Enough shares owned for a Sell | Submitted → Validated / Rejected; re-checked at Validated → Accepted / Rejected |
| BR-6 | A valid stock price (> $0, ≤ 15 minutes old) is required | Submitted → Validated / Rejected |
| BR-7 | Accepted trades update cash, holdings, and the record in one atomic commit | Validated → Accepted |
| BR-8 | Rejected trades change nothing; a failed commit is rolled back | Submitted / Validated → Rejected |
| BR-9 | Only Market orders are executed | Submitted → Validated / Rejected |

Rule numbers match [business-rules.md](../02-requirements/business-rules.md).