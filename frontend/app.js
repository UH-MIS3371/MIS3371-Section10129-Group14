// MarketStreet — frontend. Trade orders are sent to the local Express backend with fetch() (Week 9).
// Shared state, formatting, and browser-demo business rules. Each page loads its own script.
// The code follows the three tiers in docs/03-system-design/architecture.md:
//   DATA          load/save the account and trade records (localStorage stands in for the database)
//   APPLICATION   submitOrder() applies the business rules BR-1 to BR-9 and decides Accepted or Rejected
//   PRESENTATION  trade.js, history.js, result.js, and login.js initialize their own pages
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
