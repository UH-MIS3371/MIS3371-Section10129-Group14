// MarketStreet — browser-only version of the app (no backend yet).
// The code follows the three tiers in docs/03-system-design/architecture.md:
//   DATA          load/save the account and trade records (localStorage stands in for the database)
//   APPLICATION   submitOrder() applies the business rules BR-1 to BR-9 and decides Accepted or Rejected
//   PRESENTATION  one render function per page; the browser only checks the form (BR-1 to BR-3)
// All money is stored in whole cents so "exactly enough cash" (BR-4) compares correctly.

const USER_ID = "U10427";
const STORAGE_KEY = "marketstreet-demo";
const START = { cash: 1000000, holdings: { AAPL: 10, MSFT: 2, IBM: 1 }, trades: [], nextId: 418 };

// ======================= DATA =======================

let memoryState = null; // used if the browser blocks localStorage

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) return saved;
  } catch (e) {
    if (memoryState) return structuredClone(memoryState);
  }
  return structuredClone(START);
}

// One save writes cash, holdings, and the trade record together (the "atomic commit", BR-7)
function saveState(state) {
  memoryState = structuredClone(state);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // Private mode or blocked storage: keep the in-memory copy for this page only
  }
}

function resetState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {}
  memoryState = null;
}

// ======================= HELPERS =======================

function cents(dollars) {
  return Math.round(dollars * 100);
}

function money(c) {
  return (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function plural(n, word) {
  return n + " " + word + (n === 1 ? "" : "s");
}

function formatTime(iso, withSeconds) {
  const options = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  if (withSeconds) {
    options.year = "numeric";
    options.second = "2-digit";
  }
  return new Date(iso).toLocaleString("en-US", options);
}

// Change since previous close, always shown with an arrow and a sign (never color alone)
function changeText(changeCents, baseCents) {
  const arrow = changeCents >= 0 ? "▲" : "▼";
  const sign = changeCents >= 0 ? "+" : "−";
  const pct = baseCents ? Math.abs((changeCents / baseCents) * 100).toFixed(2) : "0.00";
  return arrow + " " + sign + money(Math.abs(changeCents)) + " (" + pct + "%) today";
}

function setChange(el, changeCents, baseCents) {
  el.textContent = changeText(changeCents, baseCents);
  el.className = changeCents >= 0 ? "up" : "down";
}

// Small DOM builder; text is always set with textContent so user input is never run as HTML
function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const key in attrs || {}) {
    if (key === "class") node.className = attrs[key];
    else node.setAttribute(key, attrs[key]);
  }
  for (const child of children) {
    if (child !== null && child !== undefined) node.append(child);
  }
  return node;
}

function priceOf(symbol) {
  return cents(STOCKS[symbol].price);
}

// ======================= APPLICATION =======================
// submitOrder() is the only place that changes the account. It re-checks everything,
// because browser checks can be bypassed (FR-2).

function submitOrder(order) {
  const state = loadState();
  const now = new Date().toISOString();
  const symbol = String(order.symbol || "").trim().toUpperCase();
  const quantity = order.quantity;

  // Submitted: the record exists and gets its transaction ID
  const record = {
    transactionId: "TRD-" + String(state.nextId++).padStart(5, "0"),
    userId: USER_ID, // from the signed-in session, never from the form (FR-7)
    stockSymbol: symbol,
    tradeType: order.tradeType,
    orderType: order.orderType,
    shareQuantity: quantity,
    status: "Submitted",
    submittedAt: now,
  };

  function reject(reason) {
    record.status = "Rejected";
    record.rejectionReason = reason;
    record.rejectionCategory = "Rule";
    record.completedAt = new Date().toISOString();
  }

  const owned = state.holdings[symbol] || 0;

  if (record.tradeType !== "Buy" && record.tradeType !== "Sell") {
    reject("Invalid trade type. Choose Buy or Sell."); // BR-1
  } else if (!STOCKS[symbol]) {
    reject(symbol + " isn't a supported stock."); // BR-2
  } else if (!Number.isInteger(quantity) || quantity < 1) {
    reject("Invalid quantity. Enter a whole number of 1 or more."); // BR-3
  } else if (record.orderType !== "Market") {
    reject("Limit orders are not supported."); // BR-9
  } else if (!(priceOf(symbol) > 0)) {
    reject("Price unavailable."); // BR-6
  } else {
    // The price is taken once and fixed for this trade (BR-6)
    record.executionPrice = priceOf(symbol);
    record.transactionValue = record.executionPrice * quantity;
    record.priceTimestamp = now;

    if (record.tradeType === "Buy" && record.transactionValue > state.cash) {
      reject("Insufficient cash. This order costs " + money(record.transactionValue) + " and you have " + money(state.cash) + "."); // BR-4
    } else if (record.tradeType === "Sell" && quantity > owned) {
      reject("Insufficient shares. You tried to sell " + quantity + " " + symbol + ", but you own " + owned + "."); // BR-5
    } else {
      record.status = "Validated";
      record.validatedAt = new Date().toISOString();

      // Commit: cash, holdings, and the Accepted record change together (BR-7)
      if (record.tradeType === "Buy") {
        state.cash -= record.transactionValue;
        state.holdings[symbol] = owned + quantity;
      } else {
        state.cash += record.transactionValue;
        state.holdings[symbol] = owned - quantity;
        if (state.holdings[symbol] === 0) delete state.holdings[symbol];
      }
      record.status = "Accepted";
      record.completedAt = new Date().toISOString();
    }
  }

  state.trades.push(record);
  saveState(state);
  return record;
}

// ======================= PRESENTATION =======================

function renderTrade() {
  const params = new URLSearchParams(location.search);
  const symbol = (params.get("symbol") || "AAPL").trim().toUpperCase();

  if (!STOCKS[symbol]) {
    // BR-2 in the browser: unknown symbols never reach the order form
    document.getElementById("stock").hidden = true;
    document.getElementById("not-found").hidden = false;
    document.getElementById("missing-symbol").textContent = symbol || "That stock";
    return;
  }

  const stock = STOCKS[symbol];
  const price = cents(stock.price);
  document.title = symbol + " – MarketStreet";
  document.getElementById("stock-title").textContent = symbol;
  document.getElementById("company").textContent = stock.name;
  document.getElementById("price").textContent = money(price);
  setChange(document.getElementById("change"), price - cents(stock.prev), cents(stock.prev));

  const chart = document.getElementById("stock-chart");
  chart.dataset.points = JSON.stringify(stock.month);
  chart.setAttribute("aria-label", symbol + " price over the last month, ending at " + money(price));

  const stats = [
    ["Open", money(cents(stock.open))],
    ["Day high", money(cents(stock.high))],
    ["Day low", money(cents(stock.low))],
    ["Previous close", money(cents(stock.prev))],
    ["Volume", stock.volume],
    ["52-week range", money(cents(stock.low52)) + " – " + money(cents(stock.high52))],
  ];
  const statsList = document.getElementById("stats");
  for (const [name, value] of stats) statsList.append(el("div", null, el("dt", null, name), el("dd", null, value)));

  document.getElementById("order-title").textContent = "Trade " + symbol;
  document.getElementById("order-price").textContent = "Market · " + money(price);

  const form = document.getElementById("order-form");
  const quantityInput = document.getElementById("quantity");
  const hint = document.getElementById("quantity-hint");
  const error = document.getElementById("quantity-error");
  const submit = document.getElementById("submit");

  function tradeType() {
    return form.querySelector("input[name=tradeType]:checked").value;
  }

  // BR-3 in the browser: a positive whole number
  function quantityError() {
    const raw = quantityInput.value.trim();
    if (!/^\d+$/.test(raw) || Number(raw) < 1) return "Enter a whole number of 1 or more.";
    return "";
  }

  function update() {
    const state = loadState();
    const owned = state.holdings[symbol] || 0;
    const type = tradeType();
    const qty = Number(quantityInput.value);
    const valid = !quantityError();

    document.getElementById("owned").textContent = plural(owned, "share") + " · " + money(price * owned);
    document.getElementById("cash").textContent = money(state.cash);

    submit.textContent = "Place " + type + " order";
    submit.className = "button " + type.toLowerCase();

    if (valid) {
      document.getElementById("estimate-text").textContent = type + " " + qty + " " + symbol + " at " + money(price);
      document.getElementById("estimate-total").textContent = money(price * qty);
    } else {
      document.getElementById("estimate-text").textContent = "Enter the number of shares to see your total.";
      document.getElementById("estimate-total").textContent = "—";
    }

    // Warn early; the application still makes the final decision (BR-4, BR-5)
    const maxBuy = Math.floor(state.cash / price);
    hint.className = "help";
    if (type === "Sell") {
      hint.textContent = "You own " + plural(owned, "share") + " of " + symbol + ".";
      if (valid && qty > owned) {
        hint.textContent = "You only own " + plural(owned, "share") + ", so this order will be rejected.";
        hint.className = "help warning";
      }
    } else {
      hint.textContent = "With your cash you can buy up to " + plural(maxBuy, "share") + ".";
      if (valid && qty > maxBuy) {
        hint.textContent = "This costs more than your cash (" + money(state.cash) + "), so this order will be rejected.";
        hint.className = "help warning";
      }
    }
  }

  quantityInput.addEventListener("input", () => {
    if (!error.hidden && !quantityError()) {
      error.hidden = true;
      quantityInput.removeAttribute("aria-invalid");
    }
    update();
  });
  form.querySelectorAll("input[name=tradeType]").forEach((input) => {
    input.addEventListener("change", update);
  });
  form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = quantityError();
  const serverMessage = document.getElementById("server-message");

  serverMessage.textContent = "";

  if (message) {
    error.textContent = message;
    error.hidden = false;
    quantityInput.setAttribute("aria-invalid", "true");
    quantityInput.focus();
    return;
  }

  // Prepare the stock trade for the local backend
  const state = loadState();

  const trade = {
    symbol: symbol,
    tradeType: tradeType(),
    quantity: Number(quantityInput.value),
    orderType: "Market",
    price: stock.price,
    cash: state.cash / 100,
    sharesOwned: state.holdings[symbol] || 0
  };

  submit.disabled = true;

  try {
    // Send the trade to our Express server
    const response = await fetch("/api/trades", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(trade)
    });

    const result = await response.json();

    if (!response.ok || result.status !== "ACCEPTED") {
      serverMessage.textContent =
        "Trade rejected: " + (result.reason || result.message || "Validation failed.");
      serverMessage.className = "error";
      return;
    }

    serverMessage.textContent =
      "Trade validated by backend. Not executed or saved yet.";
    serverMessage.className = "up";

  } catch (error) {
    serverMessage.textContent =
      "Cannot reach the local backend. Check that the server is running.";
    serverMessage.className = "error";

  } finally {
    submit.disabled = false;
  }
});
update();
}

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

function renderHistory() {
  document.getElementById("reset").addEventListener("click", () => {
    if (confirm("Reset the demo account to $10,000 cash and clear your trade history?")) {
      resetState();
      location.reload();
    }
  });

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

// Demo sign-in (FR-7): there is no backend yet, so any username and password continue.
// The form is handled here so the password is never put in the page address.
function renderLogin() {
  document.getElementById("login-form").addEventListener("submit", (event) => {
    event.preventDefault();
    location.href = "trade.html";
  });
}

const pages = { login: renderLogin, trade: renderTrade, result: renderResult, history: renderHistory };
const render = pages[document.body.dataset.page];
if (render) render();