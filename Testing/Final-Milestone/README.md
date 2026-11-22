# Milestone 4 checklist (due Sun Nov 22, 11:59 PM CT)

Every student submits their own: the live URL, the test matrix, and their own recording.

Teammates: read [RECORDING-GUIDE.md](RECORDING-GUIDE.md) first. The **Demo** page on the site also runs this matrix in the browser ("Run the test matrix") and shows expected next to actual.

## 1. Make the matrix real (on the deployed site)

`run-matrix.js` sends the same JSON the order form sends and records expected vs actual for 24 cases (valid, invalid, boundary, business rule, retrieval, not-found, errors). It already passes locally (23 pass, 1 explained). Run it against the live API:

```
BASE=https://<api-id>.execute-api.us-east-1.amazonaws.com/api TOKEN=<ID token> node Testing/Final-Milestone/run-matrix.js
node Testing/Final-Milestone/make-pdf.js "MarketStreet"
```

- Get a token by signing in on the site and copying `marketstreet-id-token` from the browser (DevTools → Application → Session storage), or with `aws cognito-idp initiate-auth --auth-flow USER_PASSWORD_AUTH --client-id 39ufd4fucor0jpnhklpdqdo8lh --auth-parameters USERNAME=<email>,PASSWORD=<password>` (use the `IdToken`).
- Add `OTHER_TOKEN=<second user's token>` to include the "another user cannot read it" case.
- The run resets the tester's paper account first, so use a dedicated tester or grader account.
- Submit `test-matrix.pdf` (or the `.csv`). Both list inputs, expected, actual and pass/fail.

## 2. Grader access

Create one account for the instructor and TAs (sign up on the site, or ask me to create it in Cognito) and put its email and password in the Canvas submission comment. Check the URL works in a private window.

## 3. Recording (5 to 8 minutes, screen plus voice, on the live site)

1. Open the deployed URL and sign in.
2. Markets → NVDA → enter 1 share → Review buy order → submit. Point out the **confirmation number** on the receipt.
3. Activity → **Check transaction status** → paste the confirmation number → View status. Show the stored record.
4. Try a nonexistent number (`00000000-0000-4000-8000-000000000000`) and show the message.
5. Invalid and boundary: 0 shares (field error); a Buy larger than your cash (Rejected with a reason, saved in Activity); Sell more than you own; the largest affordable Buy accepted (82 NVDA from $10,000).
6. Show Activity listing both Accepted and Rejected records, and say they come from DynamoDB.
7. Say one sentence on each test matrix group and what the server enforces independently of the browser.

## 4. Before you submit

- [ ] Live URL opens for someone who is not you
- [ ] Matrix run on the live API, PDF generated, zero unexpected failures
- [ ] Your own recording uploaded
- [ ] Canvas: URL + matrix + recording, submitted by you
