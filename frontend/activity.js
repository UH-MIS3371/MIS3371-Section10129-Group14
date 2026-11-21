// Activity: the signed-in user's saved trades from the server, filterable and paged.

const PAGE_SIZE = 20;
let allTrades = [];
let page = 0;
let statusFilter = "";

function filtered() {
  const symbol = document.getElementById("symbolFilter").value;
  return allTrades.filter((t) => (!statusFilter || t.status === statusFilter) && (!symbol || t.stockSymbol === symbol));
}

function renderRows() {
  const list = filtered();
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  page = Math.min(page, pages - 1);
  const shown = list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  document.getElementById("count").textContent = plural(list.length, "order");
  document.getElementById("rows").replaceChildren(...shown.map((t) => {
    const link = "result.html?id=" + encodeURIComponent(t.transactionId);
    return el("tr", { onclick: (e) => { if (!e.target.closest("a")) location.href = link; } },
      el("td", { "data-label": "Order" }, el("a", { href: link }, orderText(t))),
      el("td", { "data-label": "Status" }, el("div", null, statusPill(t.status), t.rejectionReason ? el("div", { class: "note" }, t.rejectionReason) : null)),
      el("td", { class: "num", "data-label": "Price" }, t.executionPrice ? money(cents(t.executionPrice)) : "—"),
      el("td", { class: "num", "data-label": "Total" }, t.transactionValue ? money(cents(t.transactionValue)) : "—"),
      el("td", { class: "mono muted", "data-label": "Reference" }, shortId(t.transactionId)),
      el("td", { class: "num muted", "data-label": "Submitted" }, el("span", { title: formatTime(t.submittedAt, true) }, formatTime(t.submittedAt))));
  }));
  const state = document.getElementById("state");
  if (!allTrades.length) state.replaceChildren(emptyState("No orders yet", "When you buy or sell a stock, the order shows up here.", el("a", { class: "btn primary", href: "markets.html" }, "Browse markets")));
  else if (!list.length) state.replaceChildren(emptyState("No orders match these filters", null, el("button", { type: "button", class: "btn", onclick: clearFilters }, "Clear filters")));
  else state.replaceChildren();
  document.getElementById("pager").hidden = pages <= 1;
  document.getElementById("pageInfo").textContent = (page * PAGE_SIZE + 1) + "–" + Math.min(list.length, (page + 1) * PAGE_SIZE) + " of " + list.length;
  document.getElementById("prev").disabled = page === 0;
  document.getElementById("next").disabled = page >= pages - 1;
}

function clearFilters() {
  statusFilter = "";
  document.getElementById("symbolFilter").value = "";
  document.querySelectorAll("#statusFilter button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.status === "")));
  renderRows();
}

function useActivity(trades, me) {
  allTrades = trades;
  const symbols = [...new Set(trades.map((t) => t.stockSymbol).filter(Boolean))].sort();
  const filter = document.getElementById("symbolFilter");
  const chosen = filter.value;
  filter.replaceChildren(el("option", { value: "" }, "All stocks"), ...symbols.map((s) => el("option", { value: s }, s)));
  filter.value = symbols.includes(chosen) ? chosen : "";
  if (me.account.resetAt) {
    document.getElementById("resetNote").replaceChildren(el("div", { class: "alert info" }, "You reset your paper account on " + formatDate(me.account.resetAt) + ". Orders from before the reset stay here for your records."));
  }
  renderRows();
}

// Draws the last known orders at once, then refreshes them from the server
async function loadActivity() {
  const cached = peek("/trades");
  const me = peek("/me");
  if (cached && me) useActivity(cached.trades, me);
  else document.getElementById("rows").replaceChildren(...skeletonRows(6));
  document.getElementById("state").replaceChildren();
  try {
    const [{ trades }, fresh] = await Promise.all([api("/trades"), loadMe()]);
    useActivity(trades, fresh);
  } catch (e) {
    document.getElementById("rows").replaceChildren();
    document.getElementById("state").replaceChildren(el("div", { style: "padding: 16px 20px" }, errorState("Your activity could not be loaded. " + e.message, loadActivity)));
  }
}

document.getElementById("statusFilter").addEventListener("click", (e) => {
  const button = e.target.closest("button");
  if (!button) return;
  statusFilter = button.dataset.status;
  page = 0;
  document.querySelectorAll("#statusFilter button").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
  renderRows();
});
document.getElementById("symbolFilter").addEventListener("change", () => { page = 0; renderRows(); });
document.getElementById("prev").addEventListener("click", () => { page--; renderRows(); });
document.getElementById("next").addEventListener("click", () => { page++; renderRows(); });

// Check transaction status: the record is fetched from DynamoDB through GET /api/trades/{id}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function showStatus(...nodes) {
  document.getElementById("statusResult").replaceChildren(el("div", { style: "margin-top: 16px" }, nodes));
}

async function lookupTransaction(raw) {
  const code = raw.trim();
  if (!code) return showStatus(el("p", { class: "error" }, "Enter a confirmation number."));
  let id = code;
  // The short reference shown in lists (MS-1A2B3C4D) is matched against your own saved orders first
  if (/^MS-[0-9a-f]{8}$/i.test(code)) {
    const hit = allTrades.find((t) => shortId(t.transactionId) === code.toUpperCase());
    id = hit ? hit.transactionId : "";
  }
  const missing = () => showStatus(el("p", { class: "error" }, "No transaction was found with that confirmation number. Check the number on your receipt and try again."));
  if (!UUID_RE.test(id)) return missing();
  const button = document.getElementById("statusButton");
  button.disabled = true;
  showStatus(el("span", { class: "skeleton", style: "width: 60%" }));
  try {
    const { trade: t } = await api("/trades/" + encodeURIComponent(id));
    const accepted = t.status === "Accepted";
    showStatus(
      el("div", { class: "receipt-head", style: "margin-bottom: 12px" }, el("h3", null, orderText(t)), statusPill(t.status)),
      el("dl", { class: "kv" },
        [["Confirmation number", t.transactionId],
         ["Outcome", accepted ? "Saved, and your cash and holdings were updated." : "Not processed. " + (t.rejectionReason || "")],
         ["Execution price", t.executionPrice ? money(cents(t.executionPrice)) : "—"],
         ["Total", t.transactionValue ? money(cents(t.transactionValue)) : "—"],
         ["Submitted", formatTime(t.submittedAt, true)],
         ["Completed", formatTime(t.completedAt || t.validatedAt, true)]].map(([k, v]) => el("div", null, el("dt", null, k), el("dd", null, v)))),
      el("a", { class: "btn sm", href: "result.html?id=" + encodeURIComponent(t.transactionId), style: "margin-top: 14px" }, "Open receipt"));
  } catch (e) {
    if (e.status === 404) missing();
    else showStatus(errorState("The transaction could not be retrieved. " + e.message, () => lookupTransaction(code)));
  }
  button.disabled = false;
}

document.getElementById("statusForm").addEventListener("submit", (e) => {
  e.preventDefault();
  lookupTransaction(document.getElementById("confirmationNumber").value);
});
if (location.hash === "#status") document.getElementById("confirmationNumber").focus();

loadActivity();

