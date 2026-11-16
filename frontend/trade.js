// Stock page: quote, chart, the user's position and history in this stock, and the order ticket.
// The ticket has two steps: Review order (checks in the browser, FR-2), then Submit (the server decides).

const symbol = (new URLSearchParams(location.search).get("symbol") || "AAPL").trim().toUpperCase();
const stock = STOCKS[symbol];
let account = null;
let myTrades = [];
let reviewing = false;
let requestId = crypto.randomUUID();

const $ = (id) => document.getElementById(id);
const form = $("orderForm");
const quantityInput = $("shareQuantity");

function tradeType() {
  return form.querySelector("input[name=tradeType]:checked").value;
}

// BR-3 in the browser: a positive whole number
function quantityError() {
  const raw = quantityInput.value.trim();
  if (!/^\d+$/.test(raw) || Number(raw) < 1) return "Enter a whole number of shares, 1 or more.";
  return "";
}

function renderQuote() {
  const price = priceCents(symbol);
  const prev = cents(stock.prev);
  document.title = symbol + " · " + stock.name + " – MarketStreet";
  $("crumbSymbol").textContent = symbol;
  $("symbolTitle").textContent = symbol;
  $("company").textContent = stock.name;
  $("price").textContent = money(price);
  $("change").textContent = signedMoney(price - prev) + " (" + percent((price - prev) / prev) + ") today";
  $("change").className = "mono " + trendClass(price - prev);
  const chart = $("stockChart");
  chart.dataset.points = JSON.stringify(stock.month);
  chart.setAttribute("aria-label", symbol + " price over the last month, ending at " + money(price));
  drawCharts();
  $("stats").replaceChildren(...[
    ["Open", money(cents(stock.open))], ["Day high", money(cents(stock.high))], ["Day low", money(cents(stock.low))],
    ["Previous close", money(prev)], ["Volume", stock.volume], ["52-week range", money(cents(stock.low52)) + " – " + money(cents(stock.high52))]
  ].map(([k, v]) => el("div", null, el("dt", null, k), el("dd", null, v))));
  $("orderTitle").textContent = "Trade " + symbol;
  $("orderPrice").textContent = money(price);
  $("historyTitle").textContent = "Your " + symbol + " orders";
}

function renderPosition() {
  const p = buildPositions(account.holdings, myTrades, account.resetAt).find((x) => x.symbol === symbol);
  const total = account.cashCents + holdingsValue(account.holdings);
  if (!p) {
    $("position").replaceChildren(el("div", { style: "grid-column: 1 / -1" }, el("dt", null, "You don't own any " + symbol + " yet."), el("dd", { class: "muted", style: "font-family: var(--sans)" }, "Buy shares with the ticket to start a position.")));
    return;
  }
  $("position").replaceChildren(...[
    ["Shares", p.shares.toLocaleString("en-US")], ["Market value", money(p.value)], ["Average cost", p.avg === null ? "—" : money(p.avg)],
    ["Today's return", signedMoney(p.dayChange)], ["Total return", p.gain === null ? "—" : signedMoney(p.gain) + " " + percent(p.gainPct)],
    ["Portfolio share", ((p.value / total) * 100).toFixed(1) + "%"]
  ].map(([k, v]) => el("div", null, el("dt", null, k), el("dd", null, v))));
}

function renderHistory() {
  const mine = myTrades.filter((t) => t.stockSymbol === symbol);
  $("history").replaceChildren(...(mine.length ? mine.slice(0, 8).map((t) => el("tr", { onclick: () => (location.href = "result.html?id=" + t.transactionId) },
    el("td", { "data-label": "Order" }, el("a", { href: "result.html?id=" + t.transactionId }, orderText(t))),
    el("td", { "data-label": "Status" }, statusPill(t.status)),
    el("td", { class: "num", "data-label": "Price" }, t.executionPrice ? money(cents(t.executionPrice)) : "—"),
    el("td", { class: "num muted", "data-label": "When" }, timeEl(t.submittedAt))))
    : [el("tr", null, el("td", { class: "muted" }, "No orders for " + symbol + " yet."))]));
}

function setReviewing(on) {
  reviewing = on;
  requestId = crypto.randomUUID();
  $("review").hidden = !on;
  $("edit").hidden = !on;
  quantityInput.disabled = on;
  form.querySelectorAll("input[name=tradeType]").forEach((i) => (i.disabled = on));
  updateTicket();
}

function updateTicket() {
  const price = priceCents(symbol);
  const type = tradeType();
  const qty = Number(quantityInput.value);
  const valid = !quantityError();
  const submit = $("submit");
  submit.className = "btn block primary";
  submit.textContent = reviewing ? "Submit " + type.toLowerCase() + " order" : "Review " + type.toLowerCase() + " order";
  $("estimateText").textContent = type === "Buy" ? "Estimated cost" : "Estimated credit";
  $("estimateTotal").textContent = valid ? money(price * qty) : "—";
  if (!account) return;

  const owned = account.holdings[symbol] || 0;
  $("cash").textContent = money(account.cashCents);
  $("owned").textContent = plural(owned, "share");
  // Warn early; the server still makes the final decision (BR-4, BR-5)
  const hint = $("quantityHint");
  hint.className = "help";
  const maxBuy = Math.floor(account.cashCents / price);
  if (type === "Sell") {
    hint.textContent = owned ? "You can sell up to " + plural(owned, "share") + "." : "You don't own any " + symbol + " to sell.";
    if (valid && qty > owned) {
      hint.textContent = "You only own " + plural(owned, "share") + ". MarketStreet will reject this order.";
      hint.className = "help warning";
    }
  } else {
    hint.textContent = "Your buying power covers up to " + plural(maxBuy, "share") + ".";
    if (valid && qty > maxBuy) {
      hint.textContent = "This costs more than your buying power (" + money(account.cashCents) + "). MarketStreet will reject this order.";
      hint.className = "help warning";
    }
  }
}

function showFieldError(message) {
  const error = $("quantityError");
  error.textContent = message;
  error.hidden = !message;
  if (message) {
    quantityInput.setAttribute("aria-invalid", "true");
    quantityInput.focus();
  } else {
    quantityInput.removeAttribute("aria-invalid");
  }
}

async function submitOrder() {
  const submit = $("submit");
  const message = $("serverMessage");
  submit.disabled = true;
  $("edit").disabled = true;
  submit.textContent = "Submitting…";
  try {
    // Only the order goes to the server; it uses its own price, cash and shares
    const result = await api("/trades", { method: "POST", body: { symbol, tradeType: tradeType(), quantity: Number(quantityInput.value), orderType: "Market", requestId } })
      .catch((e) => (e.data && e.data.status ? e.data : Promise.reject(e)));
    requestId = crypto.randomUUID();
    sessionStorage.removeItem("marketstreet-me");
    // FR-5: show the outcome only once the record is saved
    if (result.transactionId) {
      location.href = "result.html?id=" + encodeURIComponent(result.transactionId) + "&new=1";
      return;
    }
    message.textContent = (result.status === "REJECTED" ? "Order rejected: " : "Order not saved: ") + (result.reason || "Please try again.");
    message.hidden = false;
  } catch (e) {
    message.textContent = e.message;
    message.hidden = false;
  }
  submit.disabled = false;
  $("edit").disabled = false;
  updateTicket();
}

function wireTicket() {
  quantityInput.addEventListener("input", () => {
    if (!$("quantityError").hidden && !quantityError()) showFieldError("");
    $("serverMessage").hidden = true;
    updateTicket();
  });
  form.querySelectorAll("input[name=tradeType]").forEach((i) => i.addEventListener("change", () => { $("serverMessage").hidden = true; updateTicket(); }));
  $("edit").addEventListener("click", () => setReviewing(false));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (reviewing) return submitOrder();
    const problem = quantityError();
    showFieldError(problem);
    if (problem) return;
    const qty = Number(quantityInput.value);
    const price = priceCents(symbol);
    const type = tradeType();
    const cashAfter = account ? account.cashCents + (type === "Buy" ? -1 : 1) * price * qty : null;
    $("reviewList").replaceChildren(...[
      ["Order", type + " " + plural(qty, "share") + " of " + symbol], ["Order type", "Market"], ["Price", money(price)],
      [type === "Buy" ? "Estimated cost" : "Estimated credit", money(price * qty)],
      ["Buying power after", cashAfter === null ? "—" : money(cashAfter)]
    ].map(([k, v]) => el("div", null, el("dt", null, k), el("dd", null, v))));
    setReviewing(true);
  });
  if (new URLSearchParams(location.search).get("side") === "Sell") $("sell").checked = true;
}

async function loadAccount() {
  try {
    const [me, { trades }] = await Promise.all([loadMe(true), api("/trades")]);
    account = me.account;
    myTrades = trades;
    renderPosition();
    renderHistory();
    updateTicket();
  } catch (e) {
    $("serverMessage").textContent = "Your account could not be loaded. " + e.message;
    $("serverMessage").hidden = false;
  }
}

if (!stock) {
  // BR-2 in the browser: unknown symbols never reach the order form
  $("stock").hidden = true;
  $("notFound").hidden = false;
  $("missingSymbol").textContent = symbol || "that stock";
} else {
  loadQuotes().then(() => {
    renderQuote();
    updateTicket();
    loadAccount();
  });
  wireTicket();
}
