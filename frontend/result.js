// Page-specific behavior for result.html.
function renderResult() {
  const state = loadState();
  const id = new URLSearchParams(location.search).get("id");
  const record = state.trades.find((t) => t.transactionId === id);
  const badge = document.getElementById("badge");
  const title = document.getElementById("result-title");
  const details = document.getElementById("details");

  if (!record) {
    badge.hidden = true;
    title.textContent = "Trade not found";
    document.getElementById("result-note").textContent = "Check your transaction history for your saved trades.";
    return;
  }

  const accepted = record.status === "Accepted";
  badge.textContent = record.status;
  badge.className = "badge " + (accepted ? "accepted" : "rejected");
  title.textContent = accepted ? "Your trade is complete" : "Your trade was not completed";
  document.getElementById("again").href = "trade.html?symbol=" + encodeURIComponent(record.stockSymbol);

  const rows = [
    ["Transaction ID", record.transactionId],
    ["Order", record.tradeType + " " + record.shareQuantity + " " + record.stockSymbol + " · " + record.orderType],
  ];
  if (record.executionPrice) {
    rows.push([accepted ? "Execution price" : "Price at the time", money(record.executionPrice)]);
    rows.push([accepted ? "Total" : "Order value", money(record.transactionValue)]);
  }
  rows.push(["Completed", formatTime(record.completedAt, true)]);
  if (accepted) {
    rows.push(["Cash now", money(state.cash)]);
    rows.push([record.stockSymbol + " owned now", plural(state.holdings[record.stockSymbol] || 0, "share")]);
  }
  for (const [name, value] of rows) details.append(el("dt", null, name), el("dd", null, value));

  if (!accepted) {
    const reason = document.getElementById("reason");
    reason.textContent = record.rejectionReason;
    reason.hidden = false;
    document.getElementById("result-note").textContent = "Your cash and holdings were not changed.";
  }
}

renderResult();
