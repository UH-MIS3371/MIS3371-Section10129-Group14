// MarketStreet — shared frontend code. Trade orders are sent to the backend with fetch().
// Shared state and formatting helpers. Each page loads its own script:
// trade.js, history.js, and result.js initialize their own pages.

// On localhost (npm start in aws/lambda) the local server answers /api/trades; everywhere else, AWS does.
// The cognito-login branch preview uses the test API, which requires a Cognito sign-in on every route.
const API_URL = location.hostname === "localhost" || location.hostname === "127.0.0.1"
  ? "/api/trades"
  : location.hostname.startsWith("cognito-login.")
    ? "https://qedu5ta2jc.execute-api.us-east-1.amazonaws.com/api/trades"
    : "https://59w9sz4rrl.execute-api.us-east-1.amazonaws.com/api/trades";
// GET /api/account returns the saved cash and holdings (BR-7)
const ACCOUNT_URL = API_URL.replace(/\/trades$/, "/account");
const STORAGE_KEY = "marketstreet-demo";
const START = { cash: 1000000, holdings: { AAPL: 10, MSFT: 2, IBM: 1 }, trades: [], nextId: 418 };

// ======================= DATA =======================

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) return saved;
  } catch (e) {
    // Private mode or blocked storage: use the starting account
  }
  return structuredClone(START);
}

function storeState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    // Private mode or blocked storage: the trade and account are still saved on the server
  }
}

// The server's account is the official one; the browser only keeps a copy to display
function applyAccount(state, account) {
  if (account && Number.isInteger(account.cashCents) && account.holdings) {
    state.cash = account.cashCents;
    state.holdings = { ...account.holdings };
  }
}

function saveTrade(trade, account) {
  const state = loadState();
  state.trades.push(trade);
  applyAccount(state, account);
  storeState(state);
}

// Refreshes the displayed cash and holdings from the server. Returns true if it worked.
async function syncAccount() {
  try {
    const response = await authFetch(ACCOUNT_URL);
    const result = await response.json();
    if (!response.ok || result.success !== true) return false;
    const state = loadState();
    applyAccount(state, result.account);
    storeState(state);
    return true;
  } catch (e) {
    return false;
  }
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
