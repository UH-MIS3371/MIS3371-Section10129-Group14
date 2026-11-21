"use strict";
// MarketStreet API Gateway HTTP API (Lambda proxy, payload format 2.0).
// Runtime: Node.js 20.x or later    Handler: index.handler
// Routes:  POST /api/trades                   validate a trade; if accepted, save it and update the account
//          GET  /api/trades/{transactionId}   read one saved trade
//          GET  /api/account                  read the current cash and holdings
//          /api/games...                      Scenario Mode games (see backend/games.js)
// Environment: TABLE_NAME (trades, key transactionId), ACCOUNTS_TABLE (accounts, key userId)
//              and GAMES_TABLE (Scenario Mode games, key gameId).
const crypto = require("crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { validateOrder, checkAccount } = require("./backend/trades");
const { DEMO_USER_ID, getOrCreateAccount, commitTrade, publicAccount } = require("./backend/accounts");
const { handleGames } = require("./backend/games");

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*", // demo only; could be limited to the Amplify site
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
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

// POST /api/trades: check the rules, then save an accepted trade and update the account together
async function postTrade(event) {
  const submittedAt = new Date().toISOString();

  // The body is normally a JSON string. A plain object is also accepted (Lambda console tests).
  let trade = event.body;
  if (typeof trade === "string") {
    if (event.isBase64Encoded) trade = Buffer.from(trade, "base64").toString("utf8");
    if (!trade.trim()) return reply(400, rejected("A JSON request body is required."));
    try {
      trade = JSON.parse(trade);
    } catch (e) {
      return reply(400, rejected("Request body must be valid JSON."));
    }
  } else if (trade === undefined || trade === null) {
    return reply(400, rejected("A JSON request body is required."));
  }

  // BR-1, BR-2, BR-3, BR-6, BR-9: these do not need the account
  const { quote, ...result } = validateOrder(trade);
  if (!result.success) return reply(400, result); // rejected trades are never saved

  if (!tablesConfigured()) return reply(500, serverError("The trade could not be saved. Please try again."));

  let account;
  try {
    account = await getOrCreateAccount(db, process.env.ACCOUNTS_TABLE, DEMO_USER_ID, submittedAt);
  } catch (e) {
    console.log("Account read failed:", e);
    return reply(500, serverError("The trade could not be saved. Please try again."));
  }

  // BR-4, BR-5 against the saved account (the browser's cash and shares are ignored)
  const accountProblem = checkAccount(trade, quote, account);
  if (accountProblem) return reply(400, accountProblem);
  const validatedAt = new Date().toISOString();

  // The record is built from server values only, never from browser-supplied ID, price, status or time.
  // The price is the one validateOrder checked (BR-6), so the trade executes at exactly that price.
  const completedAt = new Date().toISOString();
  const record = {
    transactionId: crypto.randomUUID(),
    userId: DEMO_USER_ID,
    stockSymbol: quote.symbol,
    tradeType: trade.tradeType,
    shareQuantity: trade.quantity,
    orderType: trade.orderType,
    executionPrice: quote.priceCents / 100,
    transactionValue: (quote.priceCents * trade.quantity) / 100,
    priceTimestamp: new Date(quote.quotedAt).toISOString(),
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
    return reply(500, serverError("The trade could not be saved. Please try again."));
  }
  if (outcome === "insufficient") {
    // The account changed after it was read (another order got there first); nothing was saved
    return reply(400, rejected(trade.tradeType === "Buy" ? "Insufficient cash." : "Insufficient shares."));
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

// GET /api/account: the current cash and holdings (created with the starting values if new)
async function getAccount() {
  if (!tablesConfigured()) return reply(500, { success: false, reason: "The account could not be loaded. Please try again." });
  try {
    const account = await getOrCreateAccount(db, process.env.ACCOUNTS_TABLE, DEMO_USER_ID, new Date().toISOString());
    return reply(200, { success: true, account: publicAccount(account) });
  } catch (e) {
    console.log("Account read failed:", e);
    return reply(500, { success: false, reason: "The account could not be loaded. Please try again." });
  }
}

// GET /api/trades/{transactionId}: read one saved trade
async function getTrade(event) {
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
    if (!found.Item) return reply(404, { success: false, reason: "Trade not found." });
    return reply(200, { success: true, trade: found.Item });
  } catch (e) {
    console.log("DynamoDB read failed:", e);
    return reply(500, { success: false, reason: "The trade could not be loaded. Please try again." });
  }
}

function isAccountRoute(event) {
  return event.routeKey === "GET /api/account" || /\/api\/account\/?$/.test(event.rawPath || "");
}

async function route(event, method) {
  try {
    if (method === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };
    // Game routes first: every other POST is a trade and every other GET a trade or account lookup
    const game = await handleGames(db, event, method);
    if (game) return reply(game.statusCode, game.body);
    if (method === "POST") return await postTrade(event);
    if (method === "GET" && isAccountRoute(event)) return await getAccount();
    if (method === "GET") return await getTrade(event);
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
