# Team performance tracker

[Open the MarketStreet workbook](team-tracker.xlsx). It replaces the supplied four-person template with the six members in the [team charter](../01-project-foundation/team-charter.md). Weeks 3–6 are backfilled, with Week 7–9 entries included through October 25, 2026.

## Update each checkpoint

1. Open **Weekly log**. Filter the Week column, or click a member's rating in **Overview** to jump to their entry.
2. Update the contribution, commit evidence, and rating for each of the six members. Add paired work, reviews, testing, and other work done outside GitHub when you can confirm it.
3. Set **Leader review** to **Confirmed** after checking an entry. Resolve every **Unverified** rating before treating a checkpoint as fully reviewed.
4. To add a week, click the last cell in the log's table and press **Tab** to add a row. Add six rows, one per member, using the member and rating dropdowns. In **Overview**, copy the last week column to the right and change its week heading; the formulas read the log automatically.
5. Save the workbook and include it in the checkpoint commit.

**Weekly log is the source of truth.** Edit contributions there; **Overview** updates automatically. Freeze panes keep names and headers visible. All cells remain editable, and the workbook contains no macros or external data connections.

## Ratings and review

| Contribution rating | Meaning |
|---|---|
| Delivered | An attributable commit records a checkpoint deliverable. |
| Supported | An attributable commit records a smaller correction, refinement, or integration contribution. |
| Unverified | No attributable contribution was located for this checkpoint; the leader needs to confirm any work done elsewhere. This does not mean the member did no work. |

Ratings are qualitative assessments of documented contributions, not course grades. All reconstructed ratings start as **Provisional**; entries without evidence start as **Needs details**. The other team's names, scores, and remarks have been removed rather than reused as MarketStreet assessments.

Entries cite real commit IDs. Checkpoints follow the work products (Week 3 design exercise, Week 4 accessible HTML, Week 5 CSS, Week 6 JavaScript, Week 7 validation, Week 8 backend, Week 9 integration), since some commits were submitted after the class date. Individual assignments are identified explicitly and do not establish participation in a group exercise. Git history cannot establish attendance, effort, uncommitted work, or peer reviews.

Missing repository evidence needs confirmation for: Arya and Shayaan in Week 4; Benjamin and Shayaan in Week 5; Arya and Shayaan in Week 6. Review the later weeks in the same way. No attendance or private team messages were inferred.
