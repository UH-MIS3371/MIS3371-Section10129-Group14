# Archived interfaces

The supported MarketStreet interface is [frontend/](../frontend/index.html). It sends trades to the AWS backend in [aws/lambda/](../aws/README.md).

These earlier interfaces are retained as coursework evidence. They offer historical behavior, including Limit orders, that does not match the current Market-only scope in BR-9. Do not use them to test the current application.

| Original location | Archived location |
|---|---|
| `In-Class-Assignments/previous/` | [Early HTML, CSS, and JavaScript exercises](In-Class-Assignments/previous/) |
| `In-Class-Assignments/Week 6/` | [Week 6 quantity validation](In-Class-Assignments/Week%206/) |
| `In-Class-Assignments/Week 7/` | [Week 7 validation exercise](In-Class-Assignments/Week%207/) |
| `Testing/Trade-UI/` | [Early trade prototype](Testing/Trade-UI/trade-ui.html) |
| `server/` | [Week 9 local Express server](local-backend/server/) (run with `npm install` and `npm start` in that folder) |
| `backend/` | [Week 8 business logic and tests](local-backend/backend/) |

The September 27 Milestone page now loads its own script. The September 30 quantity-validation script belongs only to `transaction-form.html`, which contains its quantity input and live message. Current form identifiers are defined in the [data dictionary](../docs/03-system-design/data-dictionary.md) and implemented in `frontend/trade.html`; archived forms retain their historical fields.
