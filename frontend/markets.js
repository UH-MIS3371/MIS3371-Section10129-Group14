// Markets: every supported stock (BR-2) with today's move, a month sparkline and what the user owns.

let sortBy = "symbol";
let holdings = {};

function marketRows() {
  const q = document.getElementById("marketFilter").value.trim().toLowerCase();
  return Object.entries(STOCKS).filter(([symbol, s]) => !q || (symbol + " " + s.name).toLowerCase().includes(q)).map(([symbol, s]) => ({ symbol, ...s, pct: (priceCents(symbol) - cents(s.prev)) / cents(s.prev) }))
    .sort((a, b) => sortBy === "gainers" ? b.pct - a.pct : sortBy === "losers" ? a.pct - b.pct : a.symbol.localeCompare(b.symbol));
}

function renderMarkets() {
  const rows = marketRows();
  if (!rows.length) return document.getElementById("rows").replaceChildren(el("tr", null, el("td", { colspan: "8", class: "muted" }, "No stocks match that search.")));
  document.getElementById("rows").replaceChildren(...rows.map((s) => {
    const link = "trade.html?symbol=" + s.symbol;
    const owned = holdings[s.symbol] || 0;
    return el("tr", { onclick: (e) => { if (!e.target.closest("a")) location.href = link; } },
      el("td", { "data-label": "Stock" }, el("div", { class: "sym" }, el("div", null, el("a", { href: link }, el("strong", null, s.symbol)), el("span", null, s.name)))),
      el("td", { class: "num", "data-label": "Price" }, money(priceCents(s.symbol))),
      el("td", { class: "num " + trendClass(s.pct), "data-label": "Today" }, percent(s.pct)),
      el("td", { class: "hide-sm" }, sparkline(s.month.map((p) => p[1]))),
      el("td", { class: "num muted hide-sm", "data-label": "Day range" }, money(cents(s.low)) + " – " + money(cents(s.high))),
      el("td", { class: "num muted hide-sm", "data-label": "Volume" }, s.volume),
      el("td", { class: "num" + (owned ? "" : " hide-sm"), "data-label": "You own" }, owned ? plural(owned, "share") : "—"),
      el("td", { class: "num hide-sm" }, el("a", { class: "btn sm", href: link }, "Trade")));
  }));
}

document.getElementById("sort").addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  sortBy = button.dataset.sort;
  document.querySelectorAll("#sort button").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
  renderMarkets();
});

document.getElementById("marketFilter").addEventListener("input", renderMarkets);
renderMarkets();
loadQuotes().then(renderMarkets);
loadMe().then((me) => {
  holdings = me.account.holdings;
  renderMarkets();
}).catch(() => {});
