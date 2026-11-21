// MarketStreet: shared frontend code. API addresses, the api() helper and formatting.
// Each page loads its own script after this one.

// On localhost (npm start in aws/lambda) the local server answers /api/...; everywhere else, AWS does.
const API_BASE = location.hostname === "localhost" || location.hostname === "127.0.0.1"
  ? "/api"
  : "https://ixkiwxjqxl.execute-api.us-east-1.amazonaws.com/api";
const API_URL = API_BASE + "/trades"; // used by Scenario Mode and the leaderboard
const START_CASH_CENTS = 1000000;

// Calls the API with the sign-in token. Resolves to the JSON body; throws an Error with the server's
// reason (and .status) when the request fails, so pages can show what went wrong.
async function api(path, options = {}) {
  const init = { ...options, headers: { ...options.headers } };
  if (options.body !== undefined && typeof options.body !== "string") {
    init.body = JSON.stringify(options.body);
    init.headers["Content-Type"] = "application/json";
  }
  let response;
  try {
    response = await authFetch(API_BASE + path, init);
  } catch (e) {
    throw Object.assign(new Error("Couldn't reach MarketStreet. Check your connection and try again."), { status: 0 });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.reason || "Something went wrong. Please try again."), { status: response.status, data });
  // GET answers are kept for this tab so the next page can draw at once; any change clears them
  if (!init.method || init.method === "GET") {
    try {
      sessionStorage.setItem("ms-cache:" + path, JSON.stringify({ at: Date.now(), data }));
    } catch (e) {
      // storage full or blocked: fine, it is only a cache
    }
  } else {
    clearCache();
  }
  return data;
}

// The last answer for a GET path in this tab, or null. Pages draw it first, then refresh.
function peek(path, maxAgeMs = 10 * 60 * 1000) {
  try {
    const hit = JSON.parse(sessionStorage.getItem("ms-cache:" + path));
    return hit && Date.now() - hit.at < maxAgeMs ? hit.data : null;
  } catch (e) {
    return null;
  }
}

// ======================= FORMATTING =======================

function cents(dollars) {
  return Math.round(dollars * 100);
}

function money(c) {
  return (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// +$12.30 / −$12.30, always with a sign
function signedMoney(c) {
  return (c > 0 ? "+" : c < 0 ? "−" : "") + money(Math.abs(c));
}

// ▲ +1.24% / ▼ −1.24% (a ratio like 0.0124 in, text out)
function percent(ratio, digits = 2) {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return "—";
  if (Math.abs(ratio * 100) < 0.5 / 10 ** digits) return (0).toFixed(digits) + "%";
  return (ratio >= 0 ? "▲ +" : "▼ −") + Math.abs(ratio * 100).toFixed(digits) + "%";
}

function trendClass(n) {
  return n > 0 ? "up" : n < 0 ? "down" : "";
}

function plural(n, word) {
  return n.toLocaleString("en-US") + " " + word + (n === 1 ? "" : "s");
}

function formatTime(iso, withSeconds) {
  if (!iso) return "—";
  const options = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
  if (withSeconds) {
    options.year = "numeric";
    options.second = "2-digit";
  }
  return new Date(iso).toLocaleString("en-US", options);
}

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
}

// "3 min ago", "2 days ago"; the exact time goes in a title attribute
function timeAgo(iso) {
  if (!iso) return "—";
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 45) return "just now";
  const steps = [[60, "min"], [24, "hr"], [30, "day"], [12, "month"]];
  let n = s / 60;
  for (const [size, unit] of steps) {
    if (n < size) return Math.round(n) + " " + unit + (Math.round(n) === 1 ? "" : "s") + " ago";
    n /= size;
  }
  return Math.round(n) + " yr ago";
}

function timeEl(iso) {
  return el("time", { datetime: iso || "", title: formatTime(iso, true) }, timeAgo(iso));
}

// The order as one phrase: "Buy 5 AAPL"
function orderText(t) {
  return [t.tradeType || "Order", t.shareQuantity ?? "", t.stockSymbol || ""].join(" ").replace(/\s+/g, " ").trim();
}

// Short, readable reference for a UUID: MS-1A2B3C4D
function shortId(id) {
  return id ? "MS-" + id.slice(0, 8).toUpperCase() : "—";
}

// Small DOM builder; text is always set with textContent so user input is never run as HTML
function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  for (const key in attrs || {}) {
    const value = attrs[key];
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child !== null && child !== undefined && child !== false) node.append(child);
  }
  return node;
}

function pill(text, kind) {
  return el("span", { class: "pill " + (kind || "") }, text);
}

function statusPill(status) {
  return pill(status, status === "Accepted" ? "ok" : status === "Rejected" ? "bad" : "");
}

function initials(name) {
  return String(name || "?").split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
}

// Row placeholders shown while a table loads
function skeletonRows(cols, rows = 5) {
  return Array.from({ length: rows }, () => el("tr", null, Array.from({ length: cols }, () => el("td", null, el("span", { class: "skeleton" })))));
}

function emptyState(title, text, action) {
  return el("div", { class: "empty" }, el("strong", null, title), text ? el("p", null, text) : null, action || null);
}

function errorState(message, retry) {
  return el("div", { class: "alert", role: "alert" }, el("span", null, message), retry ? el("button", { type: "button", class: "btn sm", onclick: retry }, "Try again") : null);
}

// Tiny SVG sparkline from a list of numbers
function sparkline(values, width = 96, height = 28) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i) => (i / (values.length - 1)) * width;
  const y = (v) => height - 2 - ((v - min) / (max - min || 1)) * (height - 4);
  const d = values.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1)).join("");
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("class", "spark " + (values[values.length - 1] >= values[0] ? "up" : "down"));
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("viewBox", "0 0 " + width + " " + height); // so a stylesheet can resize it without cropping
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", d);
  svg.append(path);
  return svg;
}

const QUOTE_CENTS = {};
let quotesPromise;

function useQuotes(data) {
  for (const [s, q] of Object.entries((data && data.quotes) || {})) QUOTE_CENTS[s] = q.priceCents;
}

useQuotes(peek("/quotes"));

function loadQuotes() {
  quotesPromise = quotesPromise || api("/quotes").then(useQuotes).catch(() => {});
  return quotesPromise;
}

function priceCents(symbol) {
  return QUOTE_CENTS[symbol] ?? (STOCKS[symbol] ? cents(STOCKS[symbol].price) : 0);
}

function holdingsValue(holdings) {
  return Object.entries(holdings || {}).reduce((sum, [s, q]) => sum + priceCents(s) * q, 0);
}

// Positions with average cost, from the saved holdings and the accepted trades since the last reset.
// Average cost: a buy adds its cost; a sell removes shares at the average cost so far.
function buildPositions(holdings, trades, resetAt) {
  const basis = {};
  const accepted = trades.filter((t) => t.status === "Accepted" && (!resetAt || t.submittedAt > resetAt))
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  for (const t of accepted) {
    const b = basis[t.stockSymbol] || (basis[t.stockSymbol] = { shares: 0, cost: 0 });
    const c = cents(t.transactionValue);
    if (t.tradeType === "Buy") {
      b.shares += t.shareQuantity;
      b.cost += c;
    } else if (b.shares > 0) {
      b.cost -= Math.round((b.cost / b.shares) * t.shareQuantity);
      b.shares -= t.shareQuantity;
    }
  }
  return Object.entries(holdings || {}).filter(([, q]) => q > 0).map(([symbol, shares]) => {
    const s = STOCKS[symbol];
    const price = priceCents(symbol);
    const prev = s ? cents(s.prev) : 0;
    const b = basis[symbol];
    const avg = b && b.shares === shares && shares > 0 ? Math.round(b.cost / shares) : null;
    return {
      symbol, name: s ? s.name : symbol, shares, price, value: price * shares,
      dayChange: (price - prev) * shares, dayPct: prev ? (price - prev) / prev : 0,
      avg, gain: avg === null ? null : (price - avg) * shares, gainPct: avg ? (price - avg) / avg : null
    };
  }).sort((a, b) => b.value - a.value);
}

// ======================= DAILY LEARNING STREAK =======================
// A day counts when the Learn quiz is finished that day. Kept in this browser (localStorage), so it is per device.
// Shared by the Learn and League pages.
const STREAK_KEY = "marketstreet-learn-days";

function localDay(date = new Date()) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

function learnDays() {
  try {
    const days = JSON.parse(localStorage.getItem(STREAK_KEY));
    return Array.isArray(days) ? days : [];
  } catch (e) {
    return [];
  }
}

function markLearnedToday() {
  const days = new Set(learnDays());
  days.add(localDay());
  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify([...days].sort().slice(-400)));
  } catch (e) {
    // storage blocked: the streak isn't kept
  }
}

// { count, doneToday }: days in a row up to today, or up to yesterday while today isn't done yet
function learnStreak() {
  const days = new Set(learnDays());
  const day = new Date();
  const doneToday = days.has(localDay(day));
  if (!doneToday) day.setDate(day.getDate() - 1);
  let count = 0;
  while (days.has(localDay(day))) {
    count++;
    day.setDate(day.getDate() - 1);
  }
  return { count, doneToday };
}

// 🔥 3-day streak, with this week's days (Mon–Sun) as dots
function streakBadge() {
  const { count, doneToday } = learnStreak();
  const days = new Set(learnDays());
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const dots = "MTWTFSS".split("").map((letter, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = localDay(d);
    return el("span", { class: "streak-dot" + (days.has(key) ? " done" : "") + (key === localDay() ? " today" : ""), title: key }, letter);
  });
  return el("div", { class: "streak" + (count ? " on" : "") },
    el("span", { class: "streak-count" }, count ? "🔥 " + count + "-day streak" : "🔥 No streak yet"),
    el("span", { class: "streak-note muted" }, doneToday ? "Done for today ✓" : count ? "Do today's lesson to keep it" : "Finish a lesson to start one"),
    el("span", { class: "streak-week", "aria-hidden": "true" }, dots));
}
