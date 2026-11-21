# User Stories + Acceptance Criteria

## Sign In to My Account

**As a** user, **I want to** sign in to my simulated trading account **so that** my trades and balance belong to me.

**Acceptance Criteria:**
Given I am not signed in, when I open the trade form, then I am asked to sign in first. Given I am signed in, when I submit a trade, then it is recorded under my account without me entering a user ID.

## View My Account Before Trading

**As a** user, **I want to** see my cash, my holdings, and the stock's current price **so that** I know what I can afford or sell.

**Acceptance Criteria:**
Given I am signed in, when I open the trade form and select a stock, then I see my current simulated cash balance, how many shares of that stock I own, and its current simulated price.

## Submit a Buy Order

**As a** user, **I want to** submit a buy order for a stock **so that** I can practice investing without real money.

**Acceptance Criteria:**
Given a valid stock symbol, a positive whole number share quantity, a valid price, and enough simulated cash to cover the full trade value, when I submit a Market order, then the trade is Accepted, my cash balance decreases by the trade value, my share count increases by the quantity, and a transaction record is created.

## Submit a Sell Order

**As a** user, **I want to** submit a sell order for shares I own **so that** I can close out a simulated position.

**Acceptance Criteria:**
Given a valid stock symbol, a positive whole number share quantity no greater than what I currently own, and a valid price, when I submit a Market order, then the trade is Accepted, my share count decreases by the quantity, my cash balance increases by the trade value, and a transaction record is created.

## Rejected Trade — Business Rule Failure

**As a** user, **I want to** be told clearly why a trade was rejected **so that** I understand what to fix.

**Acceptance Criteria:**
Given a buy order exceeding my available cash, a sell order exceeding my owned shares, or a stock with no valid price, when I submit the order, then the trade is Rejected, my balance and holdings remain unchanged, a transaction record is saved with the reason, and that specific reason is shown to me.

## Rejected Trade — System Failure

**As a** user, **I want** my account to stay correct if something goes wrong while my trade is being saved **so that** I never lose cash or shares to an error.

**Acceptance Criteria:**
Given a valid order whose portfolio update fails during the commit, when the failure occurs, then the update is rolled back, my balance and holdings keep their previous values, the trade is saved as Rejected with category System, and I am told the trade was not completed because of a system error.

## Invalid Input Handling

**As a** user, **I want to** have my input checked before a trade is sent **so that** I don't get a confusing or incorrect result.

**Acceptance Criteria:**
Given a missing or unrecognized stock symbol, no trade type selected, or a share quantity that is blank, non-numeric, zero, negative, or fractional, when I try to submit the order, then the form blocks submission, no transaction record is created, and a message next to the field identifies the problem.

## View Transaction History

**As a** user, **I want to** see my past trades **so that** I can track how my simulated portfolio has changed over time.

**Acceptance Criteria:**
Given at least one recorded trade, when I open my transaction history, then I see every Accepted and Rejected transaction with its ID, stock symbol, trade type, quantity, status, timestamp, and (for rejected trades) the reason.

## Reset My Account

**As a** user, **I want to** reset my paper account **so that** I can start over.

**Acceptance Criteria:**
Given I am signed in, when I type RESET and confirm, then my cash returns to $10,000.00, my holdings are cleared, and my transaction history is kept. Given I type anything else, then nothing changes.

## Admin Disables a User

**As an** admin, **I want to** disable a user **so that** they can no longer trade.

**Acceptance Criteria:**
Given I am an admin, when I disable another user, then an audit entry is written first, the user's requests are refused, and I can enable them again. Given I try to disable myself, then it is refused. Given I am not an admin, then the request returns 403 and the refusal is audited.

## Admin Adjusts Cash

**As an** admin, **I want to** adjust a user's cash **so that** I can correct or fund an account.

**Acceptance Criteria:**
Given I am an admin, when I add or remove up to $100,000 and the result is not below $0, then the cash changes and the audit entry shows the before and after values. Given the amount is larger or would make cash negative, then it is refused and cash is unchanged.

## Retrying an Order Does Not Trade Twice

**As a** user, **I want** a retried order to be safe **so that** a slow connection never buys twice.

**Acceptance Criteria:**
Given I submitted an order and the connection dropped, when the same order is sent again with the same request ID, then the original result is returned, only one transaction record exists, and my cash and holdings changed once.
