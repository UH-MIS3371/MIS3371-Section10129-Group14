"use strict";
// MarketStreet API Gateway HTTP API (Lambda proxy, payload format 2.0).
// Runtime: Node.js 20.x or later    Handler: index.handler
// Routes:  POST /api/trades                   validate a trade and save it if accepted
//          GET  /api/trades/{transactionId}   read one saved trade
// Week 11: accepted trades are saved to the DynamoDB table in TABLE_NAME (key: transactionId).
const crypto = require("crypto");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { validateTrade } = require("./backend/trades");
const { PRICE_CENTS } = require("./backend/market-data");

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

// POST /api/trades: validate with the existing backend rules, then save accepted trades
async function postTrade(event) {
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

  const result = validateTrade(trade);
  if (!result.success) return reply(400, result); // rejected trades are never saved

  if (!process.env.TABLE_NAME) {
    console.log("TABLE_NAME environment variable is not set.");
    return reply(500, serverError("The trade could not be saved. Please try again."));
  }

  // The record is built from server values only, never from browser-supplied ID, price, status or time
  const stockSymbol = trade.symbol.trim().toUpperCase();
  const priceCents = PRICE_CENTS[stockSymbol];
  const record = {
    transactionId: crypto.randomUUID(),
    stockSymbol,
    tradeType: trade.tradeType,
    shareQuantity: trade.quantity,
    orderType: trade.orderType,
    executionPrice: priceCents / 100,
    transactionValue: (priceCents * trade.quantity) / 100,
    status: "Accepted",
    submittedAt: new Date().toISOString()
  };

  try {
    // PutCommand writes the record; the condition makes sure an existing record is never overwritten
    await db.send(new PutCommand({
      TableName: process.env.TABLE_NAME,
      Item: record,
      ConditionExpression: "attribute_not_exists(transactionId)"
    }));
  } catch (e) {
    console.log("DynamoDB save failed:", e);
    return reply(500, serverError("The trade could not be saved. Please try again."));
  }

  // persisted: true is only sent after DynamoDB has confirmed the save
  return reply(200, { ...result, persisted: true, transactionId: record.transactionId, submittedAt: record.submittedAt, trade: record });
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

exports.handler = async (event) => {
  try {
    event = event || {};
    const method = (event.requestContext && event.requestContext.http && event.requestContext.http.method)
      || event.httpMethod || "POST";

    if (method === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };
    if (method === "POST") return await postTrade(event);
    if (method === "GET") return await getTrade(event);
    return reply(405, rejected("Use POST /api/trades or GET /api/trades/{transactionId}."));
  } catch (e) {
    console.log("Unexpected error:", e);
    return reply(500, serverError("Unexpected server error."));
  }
};
