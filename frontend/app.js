// MarketStreet — shared frontend code. Trade orders are sent to the backend with fetch().
// Shared state and formatting helpers. Each page loads its own script:
// trade.js, history.js, and result.js initialize their own pages.

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
