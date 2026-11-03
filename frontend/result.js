// Page-specific behavior for result.html. The trade is loaded from the API.
async function renderResult() {
  const id = new URLSearchParams(location.search).get("id") || "";
  const badge = document.getElementById("badge");
  const title = document.getElementById("result-title");
  const note = document.getElementById("result-note");
  const details = document.getElementById("details");

  badge.hidden = true;
  title.textContent = "Loading…";

  let response;
  let result;
  try {
    if (id) {
      response = await fetch(API_URL + "/" + encodeURIComponent(id));
      result = await response.json();
    }
  } catch (e) {
    title.textContent = "Couldn't load this trade";
    note.textContent = "Please check your connection and try again.";
    return;
  }

  if (!response || response.status === 404) {
    title.textContent = "Trade not found";
    note.textContent = "Check your transaction history for your saved trades.";
    return;
  }
  if (!response.ok) {
    title.textContent = "Couldn't load this trade";
    note.textContent = "Please try again.";
    return;
  }

  const record = result.trade;
  badge.hidden = false;
  badge.textContent = record.status;
  badge.className = "badge accepted";
  title.textContent = "Your trade was accepted";
  document.getElementById("again").href = "trade.html?symbol=" + encodeURIComponent(record.stockSymbol);

  const rows = [
    ["Transaction ID", record.transactionId],
    ["Order", record.tradeType + " " + record.shareQuantity + " " + record.stockSymbol + " · " + record.orderType],
    ["Execution price", money(cents(record.executionPrice))],
    ["Total", money(cents(record.transactionValue))],
    ["Submitted", formatTime(record.submittedAt, true)],
  ];
  for (const [name, value] of rows) details.append(el("dt", null, name), el("dd", null, value));
}

renderResult();
