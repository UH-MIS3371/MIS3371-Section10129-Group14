// MarketStreet leaderboard: the best finished game of each player in one scenario, ranked by the server.
// Used on leaderboard.html and under the scenario cards on scenarios.html (same element IDs on both).
// Shows display names only; the server never sends emails or user IDs.

const hasPortfolio = document.body.dataset.nav === "leaderboard";
let boardScenario = new URLSearchParams(location.search).get("scenario") || (hasPortfolio ? "portfolio" : SCENARIOS[0].id);
const SCENARIO_HEAD = ["Rank", "Player", "Return", "Stars", "Finished"];
const PORTFOLIO_HEAD = ["Rank", "Player", "Return", "Value", "Holdings"];

function renderBoardTabs() {
  const tabs = SCENARIOS.map((s) =>
    el("button", { type: "button", "data-id": s.id, "aria-pressed": String(s.id === boardScenario), title: s.name }, s.dates[s.start].slice(0, 4)));
  if (hasPortfolio) tabs.unshift(el("button", { type: "button", "data-id": "portfolio", "aria-pressed": String(boardScenario === "portfolio") }, "Portfolio"));
  document.getElementById("boardTabs").replaceChildren(...tabs);
  const title = document.getElementById("boardScenarioName");
  const legend = document.querySelector(".pager");
  if (legend && hasPortfolio) legend.hidden = boardScenario === "portfolio";
  if (title) title.textContent = boardScenario === "portfolio" ? "Portfolio return" : SCENARIOS.find((s) => s.id === boardScenario).name;
  const head = document.querySelector("#boardRows").previousElementSibling;
  if (head) head.replaceChildren(el("tr", null, ...(boardScenario === "portfolio" ? PORTFOLIO_HEAD : SCENARIO_HEAD).map((h, i) => el("th", { class: i > 1 ? "num" : null }, h))));
}

async function loadBoard() {
  const message = document.getElementById("boardMessage");
  const rows = document.getElementById("boardRows");
  renderBoardTabs();
  message.textContent = "Loading…";
  rows.replaceChildren();
  try {
    const portfolio = boardScenario === "portfolio";
    const response = await authFetch(API_URL.replace(/\/trades$/, "/leaderboard?" + (portfolio ? "board=portfolio" : "scenario=" + encodeURIComponent(boardScenario))));
    const data = await response.json();
    if (!response.ok) throw new Error(data.reason);
    if (portfolio) {
      rows.replaceChildren(...data.entries.map((r) => el("tr", { class: r.you ? "you-row" : null },
        el("td", { class: "mono" }, "#" + r.rank),
        el("td", null, r.name + (r.you ? " (you)" : "")),
        el("td", { class: "right mono" }, percent(r.returnPct)),
        el("td", { class: "right mono" }, money(r.valueCents)),
        el("td", { class: "right muted" }, String(r.holdings)))));
      message.textContent = data.entries.length ? "" : "No players are ranked yet.";
      return;
    }
    rows.replaceChildren(...data.entries.map((r) => el("tr", { class: r.you ? "you-row" : null },
      el("td", { class: "mono" }, "#" + r.rank),
      el("td", null, r.name + (r.you ? " (you)" : "")),
      el("td", { class: "right mono" }, percent(r.returnPct)),
      el("td", { class: "right stars-cell", "aria-label": r.stars + " of 3 stars" }, "★".repeat(r.stars), el("span", { class: "no-star" }, "☆".repeat(3 - r.stars))),
      el("td", { class: "right muted" }, new Date(r.finishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })))));
    const name = SCENARIOS.find((s) => s.id === boardScenario).name;
    message.textContent = data.entries.length ? "" : "Nobody has finished " + name + " yet. Finish it to take first place.";
  } catch (e) {
    message.textContent = "The leaderboard could not be loaded. Please try again.";
  }
}

// Shows one scenario's board (scenarios.js calls this after a game ends)
function showBoard(scenarioId) {
  boardScenario = scenarioId;
  loadBoard();
}

document.getElementById("boardTabs").addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (button) showBoard(button.dataset.id);
});

loadBoard();
