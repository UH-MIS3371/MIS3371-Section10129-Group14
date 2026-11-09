// MarketStreet leaderboard: the best finished game of each player in one scenario, ranked by the server.
// Used on leaderboard.html and under the scenario cards on scenarios.html (same element IDs on both).
// Shows display names only; the server never sends emails or user IDs.

let boardScenario = new URLSearchParams(location.search).get("scenario") || SCENARIOS[0].id;

function boardPercent(r) {
  return (r >= 0 ? "▲ +" : "▼ −") + Math.abs(r * 100).toFixed(2) + "%";
}

function renderBoardTabs() {
  document.getElementById("boardTabs").replaceChildren(...SCENARIOS.map((s) =>
    el("button", { type: "button", "data-id": s.id, "aria-pressed": String(s.id === boardScenario), title: s.name }, s.dates[s.start].slice(0, 4))));
  const title = document.getElementById("boardScenarioName");
  if (title) title.textContent = SCENARIOS.find((s) => s.id === boardScenario).name;
}

async function loadBoard() {
  const message = document.getElementById("boardMessage");
  const rows = document.getElementById("boardRows");
  renderBoardTabs();
  message.textContent = "Loading…";
  rows.replaceChildren();
  try {
    const response = await authFetch(API_URL.replace(/\/trades$/, "/leaderboard?scenario=" + encodeURIComponent(boardScenario)));
    const data = await response.json();
    if (!response.ok) throw new Error(data.reason);
    rows.replaceChildren(...data.entries.map((r) => el("tr", { class: r.you ? "you-row" : null },
      el("td", { class: "mono" }, "#" + r.rank),
      el("td", null, r.name + (r.you ? " (you)" : "")),
      el("td", { class: "right mono " + (r.returnPct >= 0 ? "up" : "down") }, boardPercent(r.returnPct)),
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
