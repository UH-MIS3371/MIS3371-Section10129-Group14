# MarketStreet — Requirements

## Functional Requirements

**FR-1 — Submit a Trade**  
The system shall allow a signed-in user to submit a simulated stock trade by choosing a stock symbol, selecting **Buy** or **Sell**, and entering a share quantity. The order type is **Market** (BR-9).

**FR-2 — Validate Trade Input**  
The system shall verify that the stock symbol, trade type, share quantity, and order type are present and valid (BR-1, BR-2, BR-3, BR-9). The browser checks the symbol, trade type, and quantity before submission for quick feedback. The application checks all four again, because browser checks can be bypassed and the order type is never trusted from the browser.

**FR-3 — Check Account Eligibility**  
Before accepting a trade, the system shall verify that a valid price exists (BR-6) and that the user has enough simulated cash for a Buy order (BR-4) or enough shares for a Sell order (BR-5).

**FR-4 — Create a Transaction Record**  
The system shall create one unique transaction record for each trade the application receives, whether it is later accepted or rejected. The record contains the fields listed as the official record in the [data dictionary](../03-system-design/data-dictionary.md): transaction ID, user ID, stock symbol, trade type, order type, share quantity, execution price, transaction value, and price timestamp (whenever a valid price was obtained, including trades rejected for insufficient cash or shares), status, rejection reason and category (when rejected), and timestamps.

**FR-5 — Return a Clear Trade Result**  
The system shall show whether the trade was **Accepted** or **Rejected**, along with its transaction ID. If rejected, the system shall show the rejection reason. The result is shown only after the record has been saved.

**FR-6 — Update Portfolio and Show Trading Activity**  
When a trade is accepted, the system shall update the user's simulated cash and holdings (BR-7). Every recorded trade, **Accepted and Rejected**, shall appear in the user's transaction history.

**FR-7 — Identify the Trading Account**  
The system shall require the user to be signed in to a simulated trading account before submitting a trade. The application shall take the `userId` from the signed-in session; the user never enters it.

**FR-8 — View Account Summary**  
The system shall show the signed-in user's current simulated cash balance, their holdings (shares owned per stock), and the current simulated price of the selected stock before they submit a trade.

**FR-9 — Profile and Display Name**
The system shall let a signed-in user set a display name of 3 to 20 letters, numbers, and spaces. The application validates the name. The user can also sign out of every device.

**FR-10 — Reset Paper Account**
The system shall let a signed-in user reset their paper account to the starting state (D-10) after typing `RESET` to confirm. Transaction history is kept (NFR-4) and the reset time is recorded as `resetAt`.

**FR-11 — Admin Console and Roles**
The system shall provide an admin console, for users in the `admins` role only, showing overview metrics, users, user detail, trades, games, and the audit log. Admins can adjust cash (up to ±$100,000 per action, cash never below $0), reset an account, disable or enable a user, make or remove an admin, and force a user to sign out. The application checks the role on every admin request (IC-1).

**FR-12 — Audit Log**
The system shall write an audit entry for every admin action and every refused admin request. Entries are append-only and cannot be edited or deleted (IC-4).

---

## Nonfunctional Requirements

**NFR-1 — Accessibility**  
Every trade-form control and result shall be reachable and usable with the keyboard alone (Tab, Shift+Tab, Enter, Space, arrow keys). Every input shall have a visible label, and text shall meet WCAG 2.1 AA contrast (4.5:1 for normal text).

**NFR-2 — Responsive Design**  
The interface shall remain usable at viewport widths from **360 px to 1440 px** without horizontal scrolling and without hiding required trade controls or transaction results.

**NFR-3 — Clear Error Feedback**  
Each validation message shall name the specific field or condition that prevented the trade (for example, "Enter a whole number of 1 or more" next to the quantity field), not a generic error.

**NFR-4 — Traceability**  
Transaction records shall never be deleted. Once a trade reaches Accepted or Rejected, its record shall not be modified. Each record keeps its transaction ID, status, and timestamps so it can be reviewed later.

**NFR-5 — Safe Demonstration Data**  
MarketStreet shall use fictional or non-sensitive demonstration data only and shall not require real brokerage, bank, or payment information.

**NFR-6 — Consistent Interface**  
The application shall use the same terms everywhere: **Buy/Sell** for trade type, **Market** for order type, and **Submitted, Validated, Accepted, Rejected** for the processing states. Only **Accepted** and **Rejected** are saved and shown as a trade's status (D-19).

**NFR-7 — Responsiveness**  
Under normal demonstration load, the trade result shall be displayed within **2 seconds** of the user submitting the order.

---

## Scope Note

These requirements apply to MarketStreet's scope: **submitting and processing a simulated stock trade** (FR-1 to FR-8), plus the player profile, account reset, admin console, and audit log (FR-9 to FR-12). Limit orders, real-money trading, margin, short selling, options, cryptocurrency, and brokerage integration are outside the current scope. Short selling is excluded from the main trade (BR-5). The separate Challenges game (Scenario Mode) does let players short a stock, but it uses its own game money, not the paper-trading account.
