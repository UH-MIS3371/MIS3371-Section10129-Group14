# Milestone 4 recording guide

For each teammate. Everyone records their **own** 5 to 8 minute video of the live site, with face and voice. The same URL and the same test matrix are fine. A slide deck, screenshots, or a video you did not record yourself do not count.

Live site: https://main.d2kb3xv6llewil.amplifyapp.com

## Before you record (10 minutes)

1. Start the AWS Learner Lab and keep it running while you record.
2. Open the site in a private window. Sign in with **your own account** (sign up if you do not have one).
3. Open **Demo** in the top bar. You should see "Pick an order" and "Or run every test case at once".
4. Do one full practice run. The test matrix **resets your paper account to $10,000.00** first, so use your own account and not a shared one.
5. Close other tabs and notifications. Use Win+G, OBS or Zoom (share screen, camera on).

## What to record, in order

| Time | What you do | What you say |
|---|---|---|
| 0:00 | Show your face and the address bar. | "I'm [name] from Group 14. This is our deployed MarketStreet app on AWS Amplify. I'll submit a trade, retrieve it with its confirmation number, and test the important cases." |
| 0:30 | Demo page. Pick **Valid order** and press **Start demo**. Press Next through the 7 steps. | "The browser builds the request. API Gateway checks my sign-in token. Lambda runs our business rules. DynamoDB saves the record." |
| 2:00 | On step 7, point at the **confirmation number**. Press **Copy number**. | "The page shows this confirmation number only after DynamoDB confirmed the save." |
| 2:30 | Open **Activity**. Paste the number into **Check transaction status**. | "I look the trade up with that number. The same record comes back from the database." |
| 3:15 | Back on Demo, run **Quantity 0**, then **Not enough cash**, then **Sell shares you don't own**. | Read each rejection reason aloud. "The server rejected it and saved it as a Rejected record. My cash did not change." |
| 4:30 | Press **Run the test matrix**, confirm the reset, and let it run. | "Each row is a real request. The page compares what the system returned with what the rules say should happen." |
| 5:30 | Scroll the matrix. Stop at T03, T11, T12, T14, T16, T18. | See the table below. |
| 7:00 | Scroll to the summary line. | "[N] cases passed and none failed. Two were not run here: T21 needs a second user, and T24 is covered by automated tests." |

## Cases to point at in the matrix

| Case | Group | Say |
|---|---|---|
| T03 Quantity 0 | Invalid input | "Quantity must be a positive whole number." |
| T07 Unknown symbol | Invalid input | "Stock not found." |
| T11 Buy 82 NVDA | Boundary | "The largest order I can afford is accepted." |
| T12 Buy 1 more | Boundary | "One more share is rejected: Insufficient cash." |
| T13 and T14 | Boundary | "Selling exactly what I own works. One more is rejected: Insufficient shares." |
| T15 Retried order | Business rule | "The same request sent twice is only placed once." |
| T16 and T18 | Retrieval | "A real confirmation number returns the trade. A fake one returns Trade not found." |
| T22 No token | Error handling | "A request with no sign-in token gets 401 before any of our code runs." |

## Things to know

- **Rejected orders are saved.** The system stores a Rejected record with the reason. It does not change cash or holdings. Say "rejected and recorded", not "not saved".
- **The matrix changes your account.** It resets to $10,000.00 and then trades. Record on your own account.
- **N/A rows are normal.** T21 needs a second signed-in user. T24 (database failure) cannot be triggered safely on the live system. T22 does not run in guest mode.
- **Do not use Guest mode for the recording.** Guest mode runs in the browser and sends nothing to AWS. The assignment needs the real backend.
- **If the page says it cannot reach MarketStreet,** check that the Learner Lab is running, then reload. If it still fails, tell the team leader before you record.
- **Learn and League** are extra features. Do not spend recording time on them.

## Before you submit on Canvas

- [ ] The site opens in a private window.
- [ ] You can submit a trade and look it up with its confirmation number.
- [ ] Your own recording is uploaded.
- [ ] You submitted the URL, the test matrix file, and your recording yourself.
