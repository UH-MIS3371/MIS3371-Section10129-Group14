# Milestone 4 recording guide

For each teammate. Everyone records their **own** 5 to 8 minute video of the live site, with face and voice. The same URL and the same test matrix are fine. A slide deck, screenshots, or a video you did not record yourself do not count.

Live site: https://main.d2kb3xv6llewil.amplifyapp.com

## Before you record (10 minutes)

1. Start the AWS Learner Lab and keep it running while you record.
2. Open the site in a private window. Sign in with **your own account** (sign up if you do not have one).
3. Open **Demo** in the top bar, then choose **Grader check**. Record on this page. (The other tab, **Audience demo**, is the animated walkthrough for the Nov 30 team presentation. Do not use it for this recording.)
4. Do one full practice run. The test matrix **resets your paper account to $10,000.00** first, so use your own account and not a shared one.
5. Close other tabs and notifications. Use Win+G, OBS or Zoom (share screen, camera on).

## What to record, in order

| Time | What you do | What you say |
|---|---|---|
| 0:00 | Show your face and the address bar. | "I'm [name] from Group 14. This is our deployed MarketStreet app on AWS Amplify. I'll submit a trade, retrieve it with its confirmation number, and test the important cases." |
| 0:30 | **Grader check**, step 1. Press **Valid order**. | "The page sends the order to API Gateway. Lambda checks our business rules and saves it in DynamoDB." |
| 1:15 | Point at the **confirmation number** and the HTTP 200. Press **Copy number**. | "The system returned this confirmation number only after DynamoDB confirmed the save." |
| 1:45 | Step 2. Press **Retrieve**. Then press **Try one that doesn't exist**. | "Same record, read back from the database using only the number. A made-up number returns Trade not found." |
| 2:45 | Press **Show everything saved for this account**. Then open **Activity**, paste the number into **Check transaction status**, and go back. | "These are the records DynamoDB holds for my account, Accepted and Rejected. The Activity page finds the same order." |
| 3:30 | Step 1 again. Press **Quantity 0**, **Too expensive**, **Sell more than owned**. | Read each rejection reason aloud. "The server rejected it and saved it as a Rejected record. My cash did not change." |
| 4:30 | Scroll to **The business rules we test**. | "These are the rules from our requirements. Each one lists the test cases that check it." |
| 4:45 | Step 3. Press **Run the test matrix**, confirm the reset, and let it run. | "Each row is a real request. The page compares what the system returned with what the rules say should happen." |
| 5:45 | Scroll the matrix. Stop at T03, T11, T12, T14, T16, T18. | See the table below. |
| 7:00 | Scroll up to **The business rules we test**. | "BR-1 to BR-5 and BR-7 to BR-9 each have live cases, and they passed. BR-6, the 15-minute price limit, cannot happen on the live site because our prices are always fresh. A unit test checks it instead: case U-01 in the matrix file." |
| 7:30 | Scroll to the top. All four checklist items are green. | "[N] cases passed and none failed. T21 needs a second user and T24 is covered by automated tests." |

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
- **N/A rows are normal.** T21 needs a second signed-in user. T24 (database failure) cannot be triggered safely on the live system. T22 does not run in guest mode. T23 runs only on a normal account; if you are an admin it shows Not run.
- **The matrix file has one more case than the page.** U-01 (BR-6, a price older than 15 minutes) is a unit test from `npm test`, so it is in the Excel and PDF files but not on the Grader check page.
- **The checklist at the top of the page** turns green as you go. Item 4 says Guest if you are not signed in, which means no proof of the backend.
- **Do not use Guest mode for the recording.** Guest mode runs in the browser and sends nothing to AWS. The assignment needs the real backend.
- **If the page says it cannot reach MarketStreet,** check that the Learner Lab is running, then reload. If it still fails, tell the team leader before you record.
- **Learn and League** are extra features. Do not spend recording time on them.

## Before you submit on Canvas

- [ ] The site opens in a private window.
- [ ] You can submit a trade and look it up with its confirmation number.
- [ ] Your own recording is uploaded.
- [ ] You submitted the URL, the test matrix file, and your recording yourself.
