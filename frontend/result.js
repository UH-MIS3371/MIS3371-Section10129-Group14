// Order receipt: one saved trade, Accepted or Rejected (with the reason), loaded from the API (FR-5).

async function renderReceipt() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id") || "";
  const box = document.getElementById("receipt");
  if (!id) {
    box.replaceChildren(emptyState("No order selected", "Open an order from your activity.", el("a", { class: "btn primary", href: "activity.html" }, "View activity")));
    return;
  }
  let t;
  try {
    t = (await api("/trades/" + encodeURIComponent(id))).trade;
  } catch (e) {
    box.replaceChildren(e.status === 404
      ? emptyState("Order not found", "It may belong to another account, or the link is incomplete.", el("a", { class: "btn primary", href: "activity.html" }, "View activity"))
      : errorState("This order could not be loaded. " + e.message, renderReceipt));
    return;
  }

  const accepted = t.status === "Accepted";
  const isNew = params.has("new");
  document.title = (accepted ? "Order accepted" : "Order rejected") + " – MarketStreet";
  if (isNew) toast(accepted ? orderText(t) + " accepted at " + money(cents(t.executionPrice)) + "." : "Order rejected: " + t.rejectionReason, accepted ? "" : "bad");

  const rows = [
    ["Order", orderText(t)],
    ["Order type", t.orderType || "—"],
    ["Execution price", t.executionPrice ? money(cents(t.executionPrice)) : "—"],
    [t.tradeType === "Sell" ? "Total credit" : "Total cost", t.transactionValue ? money(cents(t.transactionValue)) : "—"],
    ["Reference", el("span", null, shortId(t.transactionId), el("button", { type: "button", class: "copy", onclick: () => navigator.clipboard.writeText(t.transactionId).then(() => toast("Order ID copied.")) }, "Copy ID"))],
    ["Submitted", formatTime(t.submittedAt, true)]
  ];
  const steps = [["Submitted", t.submittedAt, ""], [accepted ? "Validated" : "Rejected", t.validatedAt, accepted ? "" : "bad"]];
  if (accepted) steps.push(["Executed and saved", t.completedAt, ""]);

  box.replaceChildren(
    el("div", { class: "receipt-head" },
      el("h1", null, accepted ? "Order accepted" : "Order rejected"), statusPill(t.status),
      el("p", { class: "muted" }, accepted ? "Your cash and holdings have been updated." : "Nothing in your account changed.")),
    accepted ? null : el("p", { class: "reason" }, el("strong", null, "Reason: "), t.rejectionReason || "Not given"),
    el("dl", { class: "kv" }, rows.map(([k, v]) => el("div", null, el("dt", null, k), el("dd", null, v)))),
    el("h2", { style: "margin: 28px 0 12px" }, "Timeline"),
    el("ol", { class: "timeline" }, steps.map(([label, at, kind]) => el("li", { class: kind || null }, el("strong", null, label), formatTime(at, true)))),
    el("div", { class: "button-row", style: "margin-top: 24px" },
      t.stockSymbol && STOCKS[t.stockSymbol] ? el("a", { class: "btn primary", href: "trade.html?symbol=" + encodeURIComponent(t.stockSymbol) }, accepted ? "Trade " + t.stockSymbol + " again" : "Fix and try again") : null,
      el("a", { class: "btn", href: "dashboard.html" }, "Go to portfolio"),
      el("a", { class: "btn", href: "activity.html" }, "View activity")));
}

renderReceipt();
