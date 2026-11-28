# Tier Responsibility Summary

Each row assigns work to the tiers shown in the [architecture diagram](architecture.md).

| Responsibility | Presentation: browser | Application logic: backend | Data: database |
|---|---|---|---|
| Trade inputs and feedback | Collect fields; check BR-1 to BR-3; explain form errors | Validate submitted fields again (BR-1 to BR-3, BR-9) | Store submitted trade fields |
| Account identity and access | Sign-in form; display the signed-in account | Derive `userId` from the session; authorize access | Store accounts |
| Cash and holdings | Display returned values | Check eligibility; calculate changes | Read stored values; commit changes |
| Stock price and trade value | Display estimates and execution values | Obtain a valid price (BR-6); calculate official value | Store execution price, value, and price timestamp |
| Transaction ID | Display returned ID | Generate once for the received trade (a UUID; the same one for a retried `requestId`) | Enforce uniqueness; persist ID |
| Status and rejection reason | Display saved outcome and reason | Decide the final status; explain rejection | Persist only the final status (Accepted or Rejected) and reason |
| Audit timestamps | Display returned timestamps | Generate trusted event timestamps | Persist timestamps |
| Accepted trade | Confirm after a confirmed commit | Commit cash, shares, and the Accepted record together in one conditional write that re-checks cash or shares | Commit related changes in one transaction |
| Rejected trade | Display saved reason | Save invalid trades once as Rejected, category Rule; if the commit fails, nothing changes and the order is saved as Rejected, category System | Preserve portfolio; persist rejection with reason and category |
| Transaction history | Request and display Accepted and Rejected trades | Authorize read access; return saved trades | Read official trade records |

Details: [Trade workflow](workflow.md) · [Field definitions](data-dictionary.md).
