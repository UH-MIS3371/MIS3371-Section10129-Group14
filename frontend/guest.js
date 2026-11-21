// Guest mode: answers MarketStreet API requests inside the browser, so a visitor can try the app with
// nothing sent to, or saved on, MarketStreet's servers. auth.js calls guestRespond() instead of fetch() while a
// guest session is active. The guest's pretend account lives in sessionStorage and disappears when the tab closes.
//
// This mirrors the rules in aws/lambda/backend/trades.js, market-data.js and trace.js (same checks, same order,
// same messages, same reply shapes). aws/lambda/tests/guest.test.js runs both on the same orders and fails if they
// ever disagree. Scenario Mode and the admin console need a real account, so guests get a "sign in" answer for them.
(function () {
  "use strict";

  const PRICE_CENTS = { AAPL: 18550, MSFT: 41230, TSLA: 24810, AMZN: 17825, GOOGL: 16480, NVDA: 12140, IBM: 22110 };
  const START_CASH_CENTS = 1000000;
  const NAME = /^[A-Za-z0-9 ]{3,20}$/;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const STATE_KEY = "marketstreet-guest-state";
  const NEEDS_ACCOUNT = "Scenario Mode saves games to an account. Create a free account to play it.";

  // [rule, what it checks, the reasons that mean it failed]; the same list the server uses for the demo's rule table
  const RULES = [
    ["Request", "The request is well-formed JSON", ["A JSON request body is required.", "Request body must be valid JSON.", "requestId must be a UUID."]],
    ["BR-1", "Trade type is Buy or Sell", ["Trade type must be Buy or Sell."]],
    ["BR-2", "The stock symbol is supported", ["Stock not found."]],
    ["BR-9", "The order type is Market", ["Limit orders are not supported.", "Order type must be Market."]],
    ["BR-3", "Quantity is a positive whole number", ["Quantity must be a positive whole number."]],
    ["BR-6", "A valid price exists (no more than 15 minutes old)", ["Price unavailable."]],
    ["BR-4 / BR-5", "Enough cash for a Buy, or enough shares for a Sell", ["Insufficient cash.", "Insufficient shares."]],
    ["BR-7", "Trade record and account saved in one atomic commit", ["The trade could not be saved. Please try again."]]
  ];

  let memory = null; // used only if sessionStorage is blocked
  let delayMs = 90; // so a guest sees the same short "working" pause as a real request

  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  // ---------- the guest's pretend account ----------

  function fresh() {
    const now = new Date().toISOString();
    return { name: "Guest", createdAt: now, cashCents: START_CASH_CENTS, holdings: {}, resetAt: null, trades: [], history: {} };
  }

  function load() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STATE_KEY));
      if (saved && typeof saved.cashCents === "number") return saved;
    } catch (e) {
      // blocked or unreadable: fall through
    }
    return memory || fresh();
  }

  function save(state) {
    memory = state;
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (e) {
      // storage blocked: the account lasts until the page reloads
    }
  }

  // ---------- the rules (same as aws/lambda/backend/trades.js) ----------

  // Returns { reason } for the first rule an order breaks, or { quote } when the order itself is fine
  function checkOrder(order) {
    if (!order || typeof order !== "object" || Array.isArray(order)) return { reason: "A JSON trade object is required." };
    if (order.tradeType !== "Buy" && order.tradeType !== "Sell") return { reason: "Trade type must be Buy or Sell." };
    const symbol = typeof order.symbol === "string" ? order.symbol.trim().toUpperCase() : "";
    if (!has(PRICE_CENTS, symbol)) return { reason: "Stock not found." };
    if (order.orderType !== "Market") return { reason: order.orderType === "Limit" ? "Limit orders are not supported." : "Order type must be Market." };
    if (typeof order.quantity !== "number" || !Number.isSafeInteger(order.quantity) || order.quantity < 1) return { reason: "Quantity must be a positive whole number." };
    return { quote: { symbol, priceCents: PRICE_CENTS[symbol], quotedAt: Date.now() } };
  }

  // BR-4 and BR-5 against the guest's account
  function checkAccount(order, quote, state) {
    if (order.tradeType === "Buy" && quote.priceCents * order.quantity > state.cashCents) return "Insufficient cash.";
    if (order.tradeType === "Sell" && order.quantity > (state.holdings[quote.symbol] || 0)) return "Insufficient shares.";
    return null;
  }

  function ruleTrace(body) {
    const failed = body.success ? -1 : RULES.findIndex((r) => r[2].includes(body.reason));
    return RULES.map(([rule, name], i) => ({
      rule, name,
      status: body.success || i < failed ? "Passed" : i === failed ? "Failed" : "Not checked",
      detail: i === failed ? body.reason : undefined
    }));
  }

  // ---------- routes ----------

  const reply = (status, body) => ({ status, body });
  const fail = (status, reason) => reply(status, { success: false, reason });
  const publicAccount = (s) => ({ cashCents: s.cashCents, holdings: { ...s.holdings } });
  const holdingsValue = (s) => Object.entries(s.holdings).reduce((sum, [sym, n]) => sum + (PRICE_CENTS[sym] || 0) * n, 0);

  function refuse(state, order, reason, quote, submittedAt) {
    const text = (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 12) : null);
    const t = order && typeof order === "object" && !Array.isArray(order) ? order : {};
    const now = new Date().toISOString();
    const record = {
      transactionId: crypto.randomUUID(),
      userId: "guest",
      stockSymbol: text(t.symbol) && text(t.symbol).toUpperCase(),
      tradeType: text(t.tradeType),
      shareQuantity: Number.isFinite(t.quantity) ? t.quantity : null,
      orderType: text(t.orderType),
      ...(quote && { executionPrice: quote.priceCents / 100, transactionValue: (quote.priceCents * t.quantity) / 100, priceTimestamp: new Date(quote.quotedAt).toISOString() }),
      ...(typeof t.requestId === "string" && { requestId: t.requestId.slice(0, 36) }),
      status: "Rejected",
      rejectionReason: reason,
      rejectionCategory: "Rule",
      submittedAt, validatedAt: now, completedAt: now, updatedAt: now
    };
    state.trades.unshift(record);
    save(state);
    return { status: "REJECTED", reason, success: false, persisted: true, transactionId: record.transactionId, trade: record };
  }

  function postTrade(body) {
    const state = load();
    const submittedAt = new Date().toISOString();
    let order = body;
    let answer;
    if (typeof body === "string") {
      if (!body.trim()) order = null;
      else {
        try {
          order = JSON.parse(body);
        } catch (e) {
          answer = refuse(state, null, "Request body must be valid JSON.", null, submittedAt);
        }
      }
    }
    if (!answer && (order === undefined || order === null)) answer = refuse(state, null, "A JSON request body is required.", null, submittedAt);

    // A retried order (same requestId) returns the record it already made instead of trading twice
    const requestId = order && typeof order === "object" ? order.requestId : undefined;
    if (!answer && requestId !== undefined) {
      if (typeof requestId !== "string" || !UUID.test(requestId)) answer = refuse(state, order, "requestId must be a UUID.", null, submittedAt);
      else {
        const same = state.trades.find((t) => t.requestId === requestId);
        if (same) {
          const base = { persisted: true, transactionId: same.transactionId, submittedAt: same.submittedAt, trade: same, duplicate: true };
          return same.status === "Accepted"
            ? reply(200, { status: "ACCEPTED", message: same.tradeType + " order accepted.", success: true, ...base, account: publicAccount(state) })
            : reply(400, { status: "REJECTED", reason: same.rejectionReason, success: false, ...base });
        }
      }
    }

    let quote;
    if (!answer) {
      const checked = checkOrder(order);
      if (checked.reason) answer = refuse(state, order, checked.reason, null, submittedAt);
      else {
        quote = checked.quote;
        const problem = checkAccount(order, quote, state);
        if (problem) answer = refuse(state, order, problem, quote, submittedAt);
      }
    }

    if (!answer) {
      const completedAt = new Date().toISOString();
      const total = quote.priceCents * order.quantity;
      const record = {
        transactionId: crypto.randomUUID(),
        userId: "guest",
        stockSymbol: quote.symbol,
        tradeType: order.tradeType,
        shareQuantity: order.quantity,
        orderType: order.orderType,
        executionPrice: quote.priceCents / 100,
        transactionValue: total / 100,
        priceTimestamp: new Date(quote.quotedAt).toISOString(),
        ...(requestId !== undefined && { requestId }),
        status: "Accepted",
        submittedAt, validatedAt: completedAt, completedAt, updatedAt: completedAt
      };
      const buy = order.tradeType === "Buy";
      state.cashCents += buy ? -total : total;
      state.holdings[quote.symbol] = (state.holdings[quote.symbol] || 0) + (buy ? order.quantity : -order.quantity);
      state.trades.unshift(record);
      save(state);
      answer = { status: "ACCEPTED", message: order.tradeType + " order accepted.", success: true, persisted: true, transactionId: record.transactionId, submittedAt, trade: record, account: publicAccount(state) };
    }

    // The demo page asks for the rule table; there is no Lambda here, so no serverMs
    if (order && typeof order === "object" && order.trace === true) answer = { ...answer, trace: ruleTrace(answer) };
    return reply(answer.success ? 200 : 400, answer);
  }

  function getMe() {
    const state = load();
    const day = new Date().toISOString().slice(0, 10);
    const valueCents = state.cashCents + holdingsValue(state);
    state.history[day] = valueCents;
    save(state);
    return reply(200, {
      success: true,
      user: { userId: "guest", email: "guest", name: state.name, isAdmin: false, createdAt: state.createdAt },
      account: {
        ...publicAccount(state), holdingsValueCents: holdingsValue(state), startCashCents: START_CASH_CENTS, resetAt: state.resetAt,
        history: Object.keys(state.history).sort().map((date) => ({ date, valueCents: state.history[date] }))
      },
      stats: {
        trades: state.trades.filter((t) => t.status === "Accepted").length,
        rejected: state.trades.filter((t) => t.status === "Rejected").length,
        games: 0, finishedGames: 0, stars: 0
      }
    });
  }

  function patchMe(body) {
    const name = body && typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    if (!NAME.test(name)) return fail(400, "Display name must be 3–20 letters, numbers or spaces.");
    const state = load();
    state.name = name;
    save(state);
    return reply(200, { success: true, name });
  }

  function resetAccount(body) {
    if (!body || body.confirm !== "RESET") return fail(400, "Type RESET to confirm.");
    const state = load();
    state.cashCents = START_CASH_CENTS;
    state.holdings = {};
    state.resetAt = new Date().toISOString();
    save(state);
    return reply(200, { success: true, account: publicAccount(state) });
  }

  function route(method, path, query, options) {
    const raw = options && options.body;
    const json = () => {
      try {
        const v = typeof raw === "string" ? JSON.parse(raw) : raw;
        return v && typeof v === "object" ? v : {};
      } catch (e) {
        return {};
      }
    };
    if (/^\/admin(\/|$)/.test(path)) return fail(403, "Admins only.");
    if (/^\/games(\/|$)/.test(path)) return fail(403, NEEDS_ACCOUNT);
    if (path === "/leaderboard") {
      return reply(200, query.get("board") === "portfolio" ? { success: true, board: "portfolio", entries: [] } : { success: true, scenarioId: query.get("scenario"), entries: [] });
    }
    if (path === "/quotes" && method === "GET") {
      return reply(200, { success: true, quotes: Object.fromEntries(Object.keys(PRICE_CENTS).map((s) => [s, { priceCents: PRICE_CENTS[s], quotedAt: Date.now() }])) });
    }
    if (path === "/me" && method === "GET") return getMe();
    if (path === "/me" && method === "PATCH") return patchMe(json());
    if (path === "/me/sign-out-everywhere" && method === "POST") return reply(200, { success: true });
    if (path === "/account/reset" && method === "POST") return resetAccount(json());
    if (path === "/account" && method === "GET") return reply(200, { success: true, account: publicAccount(load()) });
    if (path === "/trades" && method === "GET") return reply(200, { success: true, trades: load().trades });
    if (path === "/trades" && method === "POST") return postTrade(raw);
    const one = path.match(/^\/trades\/([^/]+)$/);
    if (one && method === "GET") {
      const id = decodeURIComponent(one[1]);
      const found = UUID.test(id) && load().trades.find((t) => t.transactionId === id);
      return found ? reply(200, { success: true, trade: found }) : fail(404, "Trade not found.");
    }
    return fail(405, "Use POST /api/trades, GET /api/trades/{transactionId} or GET /api/account.");
  }

  // The stand-in for authFetch(): same arguments, and the reply is a real Response, so callers can't tell the difference
  async function guestRespond(url, options = {}) {
    const u = new URL(url, "http://guest.invalid");
    const path = u.pathname.replace(/^.*?\/api(?=\/|$)/, "") || "/";
    const { status, body } = route(String(options.method || "GET").toUpperCase(), path, u.searchParams, options);
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }

  globalThis.guestRespond = guestRespond;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { guestRespond, setDelay: (ms) => { delayMs = ms; }, reset: () => { memory = null; }, PRICE_CENTS, RULES };
  }
})();
