// Page-specific behavior for history.html.
function renderHistory() {
  const trades = loadState().trades.slice().reverse();
  const body = document.getElementById("history");
  if (trades.length === 0) {
    document.getElementById("empty").hidden = false;
    document.getElementById("history-table").hidden = true;
    return;
  }
  for (const t of trades) {
    const accepted = t.status === "Accepted";
    const status = el("span", null, el("span", { class: "badge " + (accepted ? "accepted" : "rejected") }, t.status));
    if (!accepted) status.append(el("br"), el("span", { class: "note" }, t.rejectionReason));
    body.append(
      el(
        "tr",
        null,
        el("td", { "data-label": "Transaction" }, el("a", { href: "result.html?id=" + encodeURIComponent(t.transactionId) }, t.transactionId)),
        el("td", { "data-label": "Time" }, formatTime(t.completedAt || t.submittedAt, false)),
        el("td", { "data-label": "Order" }, t.tradeType + " " + t.shareQuantity + " " + t.stockSymbol),
        el("td", { "data-label": "Price", class: "num" }, t.executionPrice ? money(t.executionPrice) : "—"),
        el("td", { "data-label": "Total", class: "num" }, t.transactionValue ? money(t.transactionValue) : "—"),
        el("td", { "data-label": "Status" }, status)
      )
    );
  }
}

renderHistory();
