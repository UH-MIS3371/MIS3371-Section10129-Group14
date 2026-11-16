"use strict";
// MarketStreet API Gateway HTTP API (Lambda proxy, payload format 2.0).
// Runtime: Node.js 20.x or later    Handler: index.handler
// Routes:  POST /api/trades                   validate a trade; if accepted, save it and update the account
//          GET  /api/trades                   the signed-in user's trades, Accepted and Rejected, newest first
//          GET  /api/trades/{transactionId}   read one saved trade
//          GET  /api/account                  read the current cash and holdings
//          /api/me, /api/account/reset        profile and account settings (see backend/users.js)
//          /api/games...                      Scenario Mode games (see backend/games.js)
//          /api/admin/...                     admin console (see backend/admin.js; games in backend/games.js)
//          GET  /api/leaderboard?scenario=    best finished game of each player in one scenario
// Every route needs a signed-in user: API Gateway checks the Amazon Cognito token (JWT authorizer).
// Environment: TABLE_NAME (trades, key transactionId), ACCOUNTS_TABLE (accounts, key userId),
//              GAMES_TABLE (Scenario Mode games, key gameId), USERS_TABLE (profiles, key userId)
//              and AUDIT_TABLE (admin and account actions, key auditId).
const crypto = require("crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { validateOrder, checkAccount } = require("./backend/trades");
const { getOrCreateAccount, commitTrade, publicAccount } = require("./backend/accounts");
const { currentUser } = require("./backend/auth");
const { handleGames } = require("./backend/games");
const { resolveUser, handleMe } = require("./backend/users");
const { handleAdmin } = require("./backend/admin");
const { scanAll, audit } = require("./backend/store");

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SAVE_FAILED = "The trade could not be saved. Please try again.";

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS"
};

function reply(statusCode, body) {
  return { statusCode, headers: HEADERS, body: JSON.stringify(body) };
}

function rejected(reason) {
  return { status: "REJECTED", reason, success: false, persisted: false };
}

function serverError(reason) {
  return { status: "ERROR", reason, success: false, persisted: false };
}

function tablesConfigured() {
  if (process.env.TABLE_NAME && process.env.ACCOUNTS_TABLE) return true;
  console.log("TABLE_NAME and ACCOUNTS_TABLE environment variables must both be set.");
  return false;
}

// A Rejected record (FR-4, BR-8): the order as sent, the reason and its category. It changes nothing else.
// Only short, plain values from the request are kept.
async function saveRejected(trade, user, reason, submittedAt, quote, id) {
  if (!process.env.TABLE_NAME) return rejected(reason);
  const t = trade && typeof trade === "object" && !Array.isArray(trade) ? trade : {};
  const text = (v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 12) : null);
  const now = new Date().toISOString();
  const category = reason === "Price unavailable." || reason === SAVE_FAILED ? "System" : "Rule";
  const record = {
    transactionId: id && category === "Rule" ? id : crypto.randomUUID(),
    userId: user.userId,
    stockSymbol: text(t.symbol) && text(t.symbol).toUpperCase(),
    tradeType: text(t.tradeType),
    shareQuantity: Number.isFinite(t.quantity) ? t.quantity : null,
    orderType: text(t.orderType),
    ...(quote && {
      executionPrice: quote.priceCents / 100,
      transactionValue: (quote.priceCents * t.quantity) / 100,
      priceTimestamp: new Date(quote.quotedAt).toISOString()
    }),
    ...(typeof t.requestId === "string" && { requestId: t.requestId.slice(0, 36) }),
    status: "Rejected",
    rejectionReason: reason,
    rejectionCategory: category,
    submittedAt,
    validatedAt: now,
    completedAt: now,
    updatedAt: now
  };
  try {
    await db.send(new PutCommand({ TableName: process.env.TABLE_NAME, Item: record, ConditionExpression: "attribute_not_exists(transactionId)" }));
    return { ...rejected(reason), persisted: true, transactionId: record.transactionId, trade: record };
  } catch (e) {
    if (e.name === "ConditionalCheckFailedException") return { ...rejected(reason), duplicate: true, transactionId: record.transactionId };
    console.log("Rejected record not saved:", e);
    return rejected(reason);
  }
}

// The trade a retried order already created: returned as it was saved, nothing is changed
async function existingReply(id, user) {
  const { Item: t } = await db.send(new GetCommand({ TableName: process.env.TABLE_NAME, Key: { transactionId: id } }));
  if (!t) return reply(500, serverError(SAVE_FAILED));
  const same = { persisted: true, transactionId: id, submittedAt: t.submittedAt, trade: t, duplicate: true };
  if (t.status !== "Accepted") return reply(400, { ...rejected(t.rejectionReason), ...same });
  let account;
  try {
    account = publicAccount(await getOrCreateAccount(db, process.env.ACCOUNTS_TABLE, user.userId, new Date().toISOString()));
  } catch (e) {
    console.log("Account read failed:", e);
  }
  return reply(200, { status: "ACCEPTED", message: t.tradeType + " order accepted.", success: true, ...same, account });
}

// POST /api/trades: check the rules, then save an accepted trade and update the account together
async function postTrade(event, user) {
  const submittedAt = new Date().toISOString();
  let id;
  const refuse = async (t, reason, quote) => {
    const r = await saveRejected(t, user, reason, submittedAt, quote, id);
    return r.duplicate ? existingReply(r.transactionId, user) : reply(400, r);
  };

  // The body is normally a JSON string. A plain object is also accepted (Lambda console tests).
  let trade = event.body;
  if (typeof trade === "string") {
    if (event.isBase64Encoded) trade = Buffer.from(trade, "base64").toString("utf8");
    if (!trade.trim()) return refuse(null, "A JSON request body is required.");
    try {
      trade = JSON.parse(trade);
    } catch (e) {
      return refuse(null, "Request body must be valid JSON.");
    }
  } else if (trade === undefined || trade === null) {
    return refuse(null, "A JSON request body is required.");
  }

  // The official ID comes from the server: with a requestId it is the same for every retry of that order
  const requestId = trade && typeof trade === "object" ? trade.requestId : undefined;
  if (requestId !== undefined) {
    if (typeof requestId !== "string" || !UUID.test(requestId)) return refuse(trade, "requestId must be a UUID.");
    const hex = crypto.createHash("sha256").update(user.userId + ":" + requestId).digest("hex");
    id = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join("-");
  }

  // BR-1, BR-2, BR-3, BR-6, BR-9: these do not need the account
  const { quote, ...result } = validateOrder(trade);
  if (!result.success) return refuse(trade, result.reason);

  if (!tablesConfigured()) return reply(500, serverError(SAVE_FAILED));

  let account;
  try {
    account = await getOrCreateAccount(db, process.env.ACCOUNTS_TABLE, user.userId, submittedAt);
  } catch (e) {
    console.log("Account read failed:", e);
    return reply(500, serverError(SAVE_FAILED));
  }

  // BR-4, BR-5 against the saved account (the browser's cash and shares are ignored)
  const accountProblem = checkAccount(trade, quote, account);
  if (accountProblem) return refuse(trade, accountProblem.reason, quote);
  const validatedAt = new Date().toISOString();

  // The record is built from server values only, never from browser-supplied ID, price, status or time.
  // The price is the one validateOrder checked (BR-6), so the trade executes at exactly that price.
  const completedAt = new Date().toISOString();
  const record = {
    transactionId: id || crypto.randomUUID(),
    userId: user.userId,
    stockSymbol: quote.symbol,
    tradeType: trade.tradeType,
    shareQuantity: trade.quantity,
    orderType: trade.orderType,
    executionPrice: quote.priceCents / 100,
    transactionValue: (quote.priceCents * trade.quantity) / 100,
    priceTimestamp: new Date(quote.quotedAt).toISOString(),
    ...(requestId !== undefined && { requestId }),
    status: "Accepted",
    submittedAt,
    validatedAt,
    completedAt,
    updatedAt: completedAt
  };

  let outcome;
  try {
    // One transaction: the trade record and the cash/holdings change are saved together or not at all (BR-7)
    outcome = await commitTrade(db, {
      tradesTable: process.env.TABLE_NAME,
      accountsTable: process.env.ACCOUNTS_TABLE,
      record,
      priceCents: quote.priceCents
    });
  } catch (e) {
    console.log("DynamoDB save failed:", e);
    const saved = await saveRejected(trade, user, SAVE_FAILED, submittedAt, quote);
    return reply(500, { ...serverError(SAVE_FAILED), ...(saved.persisted && { persisted: true, transactionId: saved.transactionId }) });
  }
  if (outcome === "duplicate") return existingReply(record.transactionId, user);
  if (outcome === "insufficient") {
    // The account changed after it was read (another order got there first); nothing was saved
    return refuse(trade, trade.tradeType === "Buy" ? "Insufficient cash." : "Insufficient shares.", quote);
  }

  const totalCents = quote.priceCents * trade.quantity;
  const holdings = { ...account.holdings };
  holdings[quote.symbol] = (holdings[quote.symbol] || 0) + (trade.tradeType === "Buy" ? trade.quantity : -trade.quantity);
  const updated = {
    cashCents: account.cashCents + (trade.tradeType === "Buy" ? -totalCents : totalCents),
    holdings
  };

  // persisted: true is only sent after DynamoDB has confirmed the save
  return reply(200, {
    ...result,
    persisted: true,
    transactionId: record.transactionId,
    submittedAt: record.submittedAt,
    trade: record,
    account: publicAccount(updated)
  });
}

// GET /api/account: the signed-in user's cash and holdings (created with the starting values if new)
async function getAccount(user) {
  if (!tablesConfigured()) return reply(500, { success: false, reason: "The account could not be loaded. Please try again." });
  try {
    const account = await getOrCreateAccount(db, process.env.ACCOUNTS_TABLE, user.userId, new Date().toISOString());
    return reply(200, { success: true, account: publicAccount(account) });
  } catch (e) {
    console.log("Account read failed:", e);
    return reply(500, { success: false, reason: "The account could not be loaded. Please try again." });
  }
}

// GET /api/trades/{transactionId}: read one saved trade. Only its owner (or an admin) may read it;
// anyone else is told it was not found, so another user's trade IDs reveal nothing.
async function getTrade(event, user) {
  const id = event.pathParameters && event.pathParameters.transactionId;
  if (typeof id !== "string" || !id.trim()) {
    return reply(400, { success: false, reason: "A transactionId is required." });
  }
  // Every official ID is a UUID, so anything else cannot be a saved trade
  if (!UUID.test(id)) return reply(404, { success: false, reason: "Trade not found." });

  if (!process.env.TABLE_NAME) {
    console.log("TABLE_NAME environment variable is not set.");
    return reply(500, { success: false, reason: "The trade could not be loaded. Please try again." });
  }

  try {
    // GetCommand reads one record by its partition key
    const found = await db.send(new GetCommand({ TableName: process.env.TABLE_NAME, Key: { transactionId: id } }));
    const mine = found.Item && (found.Item.userId === user.userId || user.isAdmin);
    if (!mine) return reply(404, { success: false, reason: "Trade not found." });
    return reply(200, { success: true, trade: found.Item });
  } catch (e) {
    console.log("DynamoDB read failed:", e);
    return reply(500, { success: false, reason: "The trade could not be loaded. Please try again." });
  }
}

// GET /api/trades: the signed-in user's own trades, newest first.
// A Scan with a filter is fine at class scale; a larger site would add an index on userId + submittedAt.
async function listTrades(user) {
  if (!process.env.TABLE_NAME) return reply(500, { success: false, reason: "Your trades could not be loaded. Please try again." });
  try {
    const trades = (await scanAll(db, process.env.TABLE_NAME)).filter((t) => t.userId === user.userId)
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    return reply(200, { success: true, trades });
  } catch (e) {
    console.log("Trade list failed:", e);
    return reply(500, { success: false, reason: "Your trades could not be loaded. Please try again." });
  }
}

function isTradeListRoute(event) {
  return event.routeKey === "GET /api/trades" || /\/api\/trades\/?$/.test(event.rawPath || "");
}

function isAccountRoute(event) {
  return event.routeKey === "GET /api/account" || /\/api\/account\/?$/.test(event.rawPath || "");
}

async function route(event, method) {
  try {
    if (method === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };
    // Every route needs a signed-in user (Amazon Cognito); API Gateway has already checked the token
    const signedIn = currentUser(event);
    if (!signedIn) return reply(401, { success: false, reason: "Please sign in." });
    // The profile can disable the user, end their sessions or change their role
    const { user, error } = await resolveUser(db, signedIn);
    if (error) return reply(error.statusCode, error.body);
    // The role is checked on the server for every admin route; refusals are written to the audit log
    if (/^\/api\/admin\//.test(event.rawPath || "") && !user.isAdmin) {
      await audit(db, user, "authz.denied", { result: "failure", path: String(event.rawPath).slice(0, 100) });
      return reply(403, { success: false, reason: "Admins only." });
    }
    // Profile, admin and game routes first: every other POST is a trade and every other GET a trade or account lookup
    const handled = (await handleMe(db, event, method, user)) || (await handleAdmin(db, event, method, user)) || (await handleGames(db, event, method, user));
    if (handled) return reply(handled.statusCode, handled.body);
    if (method === "POST") return await postTrade(event, user);
    if (method === "GET" && isAccountRoute(event)) return await getAccount(user);
    if (method === "GET" && isTradeListRoute(event)) return await listTrades(user);
    if (method === "GET") return await getTrade(event, user);
    return reply(405, rejected("Use POST /api/trades, GET /api/trades/{transactionId} or GET /api/account."));
  } catch (e) {
    console.log("Unexpected error:", e);
    return reply(500, serverError("Unexpected server error."));
  }
}

// One JSON line per request for CloudWatch Logs Insights. Request bodies are never logged.
function logRequest(method, event, response, started) {
  const body = response.body ? JSON.parse(response.body) : {};
  const trade = body.trade || {};
  const requestedId = String((event.pathParameters || {}).transactionId || "").slice(0, 64) || undefined;
  console.info(JSON.stringify({
    method,
    statusCode: response.statusCode,
    result: body.status || (body.success ? "FOUND" : undefined),
    transactionId: trade.transactionId || requestedId,
    stockSymbol: trade.stockSymbol,
    tradeType: trade.tradeType,
    shareQuantity: trade.shareQuantity,
    gameId: body.game ? body.game.gameId : (event.pathParameters || {}).gameId,
    gameDay: body.game ? body.game.day : undefined,
    reason: body.reason,
    ms: Date.now() - started
  }));
}

exports.handler = async (event) => {
  const started = Date.now();
  event = event || {};
  const method = (event.requestContext && event.requestContext.http && event.requestContext.http.method)
    || event.httpMethod || "POST";
  const response = await route(event, method);
  logRequest(method, event, response, started);
  return response;
};
