"use strict";
// MarketStreet API Gateway HTTP API (Lambda proxy, payload format 2.0).
// Runtime: Node.js 20.x or 22.x    Handler: index.handler    Route: POST /api/trades
const { validateTrade } = require("./backend/trades");

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*", // demo only; could be limited to the Amplify site
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};

function reply(statusCode, body) {
  return { statusCode, headers: HEADERS, body: JSON.stringify(body) };
}

function rejected(reason) {
  return { status: "REJECTED", reason, success: false, persisted: false };
}

exports.handler = async (event) => {
  try {
    event = event || {};
    const method = (event.requestContext && event.requestContext.http && event.requestContext.http.method)
      || event.httpMethod || "POST";

    if (method === "OPTIONS") return { statusCode: 204, headers: HEADERS, body: "" };
    if (method !== "POST") return reply(405, rejected("Use POST /api/trades."));

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
    return reply(result.success ? 200 : 400, result);
  } catch (e) {
    console.log("Unexpected error:", e);
    return reply(500, { status: "ERROR", reason: "Unexpected server error.", success: false, persisted: false });
  }
};
