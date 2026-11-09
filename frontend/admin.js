// Admin page: every saved Scenario Mode game. The server only sends the list to members of the "admins"
// group (403 for everyone else), so this page shows a message instead of the table for other users.

async function loadGames() {
  const message = document.getElementById("adminMessage");
  try {
    const response = await authFetch(API_URL.replace(/\/trades$/, "/admin/games"));
    const data = await response.json();
    if (!response.ok) {
      message.textContent = response.status === 403 ? "This page is for admins only." : data.reason || "The games could not be loaded.";
      return;
    }
    message.textContent = plural(data.games.length, "game") + ", newest first.";
    document.getElementById("adminRows").replaceChildren(...data.games.map((g) => {
      const s = SCENARIOS.find((x) => x.id === g.scenarioId);
      const day = s ? g.day - s.start + 1 + " of " + (s.dates.length - s.start) : g.day;
      const result = g.returnPct === null ? "—" : (g.returnPct >= 0 ? "+" : "−") + Math.abs(g.returnPct * 100).toFixed(1) + "%";
      return el("tr", null,
        el("td", null, g.ownerEmail || "—"),
        el("td", null, s ? s.name : g.scenarioId),
        el("td", null, day),
        el("td", null, g.status === "over" ? "Finished" : "Playing"),
        el("td", { class: "num" }, g.stars === null ? "—" : "★".repeat(g.stars) + "☆".repeat(3 - g.stars)),
        el("td", { class: "num" }, result),
        el("td", null, formatTime(g.updatedAt)));
    }));
    document.getElementById("adminCard").hidden = false;
  } catch (e) {
    message.textContent = "The games could not be loaded. Please try again.";
  }
}

loadGames();
