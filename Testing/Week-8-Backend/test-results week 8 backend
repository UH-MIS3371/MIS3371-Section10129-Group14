
# Week 8 - Backend Test Results

## Project: MarketStreet TPS
Main Transaction: Submit a simulated stock trade order

## Testing Objective
The purpose of these tests is to verify that the backend correctly accepts or rejects stock trades based on the project's business rules.

## Business Rules Tested
- BR-1: Trade type must be Buy or Sell.
- BR-3: Share quantity must be a positive whole number.
- BR-4: Buy orders require sufficient cash.
- BR-5: Sell orders require sufficient shares.

## Test Results

| Test | Category | Expected | Actual | Result |
|------|----------|------|---|--------|--------|
| Buy 5 shares with sufficient cash | Valid | ACCEPTED | ACCEPTED | PASS |
| Buy 0.5 shares | Invalid | REJECTED | REJECTED | PASS |
| Sell 15 shares when owning 10 | Invalid | REJECTED | REJECTED | PASS |
| Sell 5 shares when owning 10 | Valid | ACCEPTED | ACCEPTED | PASS |
| Buy shares with exactly enough cash | Boundary | ACCEPTED | ACCEPTED | PASS |
| Sell exactly 10 shares when owning 10 | Boundary | ACCEPTED | ACCEPTED | PASS |

## Summary
All six backend trade tests passed successfully.

- Valid tests: 2/2 passed
- Invalid tests: 2/2 passed
- Boundary tests: 2/2 passed
- Overall: 6/6 passed

The tests confirm that the implemented backend rules correctly handle the six scenarios tested. Frontend-backend integration is not required for this activity.

## How to Run the Tests
From the repository root, run:

    node backend/test-backend.js
