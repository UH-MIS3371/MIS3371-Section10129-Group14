# Testing

Test plans, results and evidence for MarketStreet, oldest first. The newest material describes the live system. Older folders are kept as coursework evidence and say when they are out of date.

| Folder | When | What it holds | Still current? |
|---|---|---|---|
| [First-Check-In/](First-Check-In/index.html) | First check-in (Oct 1) | Slide deck with the first architecture, workflow and state diagrams | Historical |
| [Week-8-Backend/](Week-8-Backend/test-results.md) | Week 8 (Oct) | Six tests of the Week 8 backend rules | Historical; the backend is archived in `archive/local-backend/` |
| [Week-9-Integration-Tests.md](Week-9-Integration-Tests.md), [Week-9-Evidence/](Week-9-Evidence/) | Week 9 (Oct) | Browser-to-Express integration tests and screenshots | Historical; the Express server is retired |
| [Week-10-AWS/](Week-10-AWS/) | Week 10 (checkpoint due Nov 8) | AWS deployment checkpoint test document (Word and PDF only) | Historical |
| [Week-11-DynamoDB/](Week-11-DynamoDB/README.md) | Week 11 (Nov 2 snapshot) | Saving to DynamoDB, the GET route, Lambda console test events | Historical; see the banner at the top |
| [Week-12-Security/](Week-12-Security/README.md) | Week 12 (Nov) | Security and privacy controls, with the tests that check them | Current |
| [Week-13-Platform/](Week-13-Platform/README.md) | Week 13 (Nov) | Boundary tests, the automated test files, and a manual smoke checklist | Current |
| [Final-Milestone/](Final-Milestone/README.md) | Milestone 4 (Nov 22) | The 36-case test matrix (Excel and PDF), the matrix runner and the recording guide | Current |

## Automated tests

The backend has automated tests under `aws/lambda/tests/` (94 tests in 9 files on Nov 27). They run on every push through GitHub Actions ([`.github/workflows/test.yml`](../.github/workflows/test.yml)). To run them yourself:

```
cd aws/lambda
npm ci
npm test
```

They use an in-memory stand-in for DynamoDB, so no AWS account is needed.

## The final test matrix

The [Final-Milestone](Final-Milestone/README.md) matrix has 36 cases. 24 are automated: the live [Grader check page](https://main.d2kb3xv6llewil.amplifyapp.com/grader.html) runs them against the deployed backend. The other 11 are manual browser tests; the page lists their recorded results but does not re-run them.

## Duplicate images

Four PNGs in [First-Check-In/images/](First-Check-In/images/) are byte-for-byte copies of the files in [docs/03-system-design/archive/](../docs/03-system-design/archive/README.md): `architecture-v1.png` = `architecture.png`, and `exception-path.png`, `state-definitions.png` and `workflow.png` have the same names in both folders. Both copies are kept on purpose: the slide deck loads its images from its own folder, and the docs archive keeps the design history. `state-diagram.png` differs between the two folders.
