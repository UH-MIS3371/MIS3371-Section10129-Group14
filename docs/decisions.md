# MarketStreet — Decision Log

Important project decisions, with the reason for each. Add new decisions at the bottom. If a decision changes, add a new entry that replaces the old one instead of editing it.

> **Status:** D-1 to D-10 are **proposed**. They were drafted during a documentation review and need the team's approval. Once the team agrees, record who approved them and the date here.

| # | Date | Decision | Why | Affects |
|---|---|---|---|---|
| D-1 | 2026-10-10 | **Only Market orders are executed.** Limit orders are rejected under the new rule BR-9, and the interface should not offer them. | The documents disagreed: the proposal said Limit was out of scope, the data dictionary said it was rejected, and the prototype executed it at the user's own price. A user-chosen price lets anyone create unlimited simulated cash. | BR-9, FR-1, FR-2, data dictionary `orderType` |
| D-2 | 2026-10-10 | **`userId` is a system ID taken from the signed-in session**, never entered by the user. Sign-in is required (FR-7). | main-transaction.md listed the user ID as a user input, while the data dictionary said it must not be trusted from the browser. | FR-7, main transaction, data dictionary |
| D-3 | 2026-10-10 | **Draft is a browser form state, not a status.** The official statuses stay at four: Submitted, Validated, Accepted, Rejected. | The state diagram showed five boxes, while the proposal and slides said four states. | State diagram, main transaction, proposal |
| D-4 | 2026-10-10 | **Cash, holdings, and the Accepted record are saved in one atomic commit, and BR-4 / BR-5 are re-checked inside it** with the account locked. | The workflow drew two separate saves, so a failure between them had no defined path. Checking funds only before the commit allowed two simultaneous orders to spend the same cash. | BR-4, BR-5, BR-7, workflow, state diagram |
| D-5 | 2026-10-10 | **System failures end as Rejected with `rejectionCategory = System`**; rule failures use `Rule`. No fifth status is added. | Audits and history must tell a broken rule apart from a system error, but adding a new status would change the four-status model the team has already presented. | BR-8, data dictionary, workflow |
| D-6 | 2026-10-10 | **A valid price is greater than $0 and no more than 15 minutes old.** | BR-6 said "valid price" without defining it, so it could not be tested. 15 minutes is a team choice and can be changed here. | BR-6, data dictionary `priceTimestamp` |
| D-7 | 2026-10-10 | **Transaction history shows both Accepted and Rejected trades.** | FR-4 and the user stories said every trade, but FR-6 said only completed ones. | FR-4, FR-6, user stories |
| D-8 | 2026-10-10 | **Money uses fixed-point decimals (or whole cents), never floating point.** | Floating-point math can make "exactly enough cash" (BR-4) fail. | Data dictionary money rules |
| D-9 | 2026-10-10 | **[Stakeholders.md](02-requirements/Stakeholders.md) is the single stakeholder list.** | The proposal and the stakeholder document listed different stakeholders. | Proposal, stakeholders |
| D-10 | 2026-10-10 | **Every new simulated account starts with $10,000.00 cash and no holdings.** | The data dictionary said the account "starts at the demo amount" without saying what that amount is. $10,000 matches the current prototype. | Data dictionary `cashBalance` |
