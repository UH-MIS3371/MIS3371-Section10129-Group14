"use strict";
// Run the MarketStreet Lambda on your own computer, with no AWS account.
//   cd aws/lambda && npm install && npm start   →   http://localhost:3000
// The website in frontend/ is served from the same address, and /api/trades is
// handled by the real handler in index.js. DynamoDB is replaced by an in-memory
// table, so saved trades and the account reset when the server stops.
const http = require("http");
const fs = require("fs");
const path = require("path");

// ---- Pretend DynamoDB ----
// Supports exactly the commands the Lambda sends (Get, Put, and the TransactWrite
// from backend/accounts.js) and follows the same rules: conditions are checked, and a
// transaction saves everything or nothing.
const { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, TransactWriteCommand } = require("@aws-sdk/lib-dynamodb");

function installFakeDynamoDB() {
  const tables = new Map(); // table name -> Map(key -> item)
  const fake = {
    tables,
    failNext: false,       // set to true to make every call throw (simulated outage)
    beforeCommit: null,    // optional function run just before a transaction (to simulate a race)
    table(name) {
      if (!tables.has(name)) tables.set(name, new Map());
      return tables.get(name);
    }
  };

  // Each table has one key attribute: trades use transactionId, accounts userId, games gameId
  const KEY_NAMES = ["transactionId", "userId", "gameId"];
  const keyOf = (item) => item[KEY_NAMES.find((name) => item[name] !== undefined)];

  function conditionFailed(message) {
    const e = new Error(message || "The conditional request failed");
    e.name = "ConditionalCheckFailedException";
    return e;
  }

  // Evaluates the account Update built in backend/accounts.js
  function applyAccountUpdate(update, current) {
    const v = update.ExpressionAttributeValues;
    const symbol = update.ExpressionAttributeNames["#symbol"];
    if (!current) return { ok: false };
    const owned = current.holdings && current.holdings[symbol];
    if (update.ConditionExpression === "cashCents >= :minCash") {
      if (!(current.cashCents >= v[":minCash"])) return { ok: false };
    } else if (update.ConditionExpression === "holdings.#symbol >= :minShares") {
      if (!(owned >= v[":minShares"])) return { ok: false };
    } else {
      throw new Error("Unexpected ConditionExpression: " + update.ConditionExpression);
    }
    const next = structuredClone(current);
    next.cashCents += v[":cashDelta"];
    next.holdings[symbol] = (owned === undefined ? v[":zero"] : owned) + v[":qtyDelta"];
    next.updatedAt = v[":now"];
    return { ok: true, next };
  }

  DynamoDBDocumentClient.prototype.send = async function (command) {
    if (fake.failNext) throw new Error("Simulated DynamoDB failure (secret internal detail)");
    const input = command.input;

    if (command instanceof GetCommand) {
      const item = fake.table(input.TableName).get(keyOf(input.Key));
      return item ? { Item: structuredClone(item) } : {};
    }

    if (command instanceof PutCommand) {
      const table = fake.table(input.TableName);
      const key = keyOf(input.Item);
      const condition = input.ConditionExpression;
      if (condition && condition.startsWith("attribute_not_exists")) {
        if (table.has(key)) throw conditionFailed();
      } else if (condition === "#v = :read") {
        // The version check from backend/games.js: the saved game must still have the version that was read
        const saved = table.get(key);
        if (!saved || saved[input.ExpressionAttributeNames["#v"]] !== input.ExpressionAttributeValues[":read"]) throw conditionFailed();
      } else if (condition) {
        throw new Error("Unexpected ConditionExpression: " + condition);
      }
      table.set(key, structuredClone(input.Item));
      return {};
    }

    if (command instanceof TransactWriteCommand) {
      if (fake.beforeCommit) await fake.beforeCommit();
      if (fake.failNext) throw new Error("Simulated DynamoDB failure (secret internal detail)");
      const [{ Put: put }, { Update: update }] = input.TransactItems;
      const reasons = [{ Code: "None" }, { Code: "None" }];
      const trades = fake.table(put.TableName);
      if (trades.has(put.Item.transactionId)) reasons[0] = { Code: "ConditionalCheckFailed" };
      const accounts = fake.table(update.TableName);
      const result = applyAccountUpdate(update, accounts.get(update.Key.userId));
      if (!result.ok) reasons[1] = { Code: "ConditionalCheckFailed" };
      if (reasons.some((r) => r.Code !== "None")) {
        const e = new Error("Transaction cancelled");
        e.name = "TransactionCanceledException";
        e.CancellationReasons = reasons;
        throw e; // nothing is written
      }
      trades.set(put.Item.transactionId, structuredClone(put.Item));
      accounts.set(update.Key.userId, result.next);
      return {};
    }

    // Returns every item in one page (the Lambda picks the fields it needs)
    if (command instanceof ScanCommand) {
      return { Items: [...fake.table(input.TableName).values()].map((item) => structuredClone(item)) };
    }

    throw new Error("Unexpected command: " + command.constructor.name);
  };

  return fake;
}

module.exports = { installFakeDynamoDB };

// Tests import installFakeDynamoDB from this file; the server below only starts with `npm start`
if (require.main !== module) return;

const PORT = Number(process.env.PORT) || 3000;
const FRONTEND = path.join(__dirname, "../../frontend");

// Pretend DynamoDB (trades, accounts and games tables), kept in memory
installFakeDynamoDB();
process.env.TABLE_NAME = process.env.TABLE_NAME || "MarketStreetTrades-local";
process.env.ACCOUNTS_TABLE = process.env.ACCOUNTS_TABLE || "MarketStreetAccounts-local";
process.env.GAMES_TABLE = process.env.GAMES_TABLE || "MarketStreetGames-local";
process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";

const { handler } = require("./index");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

// Reads the Cognito ID token from the Authorization header and passes its claims the way API Gateway does.
// LOCAL ONLY: this does not check the token's signature. On AWS, API Gateway's JWT authorizer does.
function claimsFrom(req) {
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  try {
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    if (Array.isArray(claims["cognito:groups"])) claims["cognito:groups"] = "[" + claims["cognito:groups"].join(" ") + "]";
    return { jwt: { claims } };
  } catch (e) {
    return undefined;
  }
}

// Build the same event API Gateway (HTTP API, payload 2.0) sends to the Lambda
async function callLambda(req, res, routeKey, transactionId, gameId) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const event = {
    routeKey: req.method + " " + routeKey,
    rawPath: new URL(req.url, "http://localhost").pathname,
    requestContext: { http: { method: req.method }, authorizer: claimsFrom(req) },
    pathParameters: transactionId !== undefined ? { transactionId } : gameId !== undefined ? { gameId } : undefined,
    body: chunks.length ? Buffer.concat(chunks).toString("utf8") : undefined,
    isBase64Encoded: false
  };
  const result = await handler(event);
  res.writeHead(result.statusCode, result.headers);
  res.end(result.body);
}

function serveFile(req, res, pathname) {
  const file = path.normalize(path.join(FRONTEND, pathname === "/" ? "index.html" : pathname));
  if (!file.startsWith(FRONTEND + path.sep)) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, "http://localhost");
    if (pathname === "/api/trades") return await callLambda(req, res, "/api/trades");
    if (pathname === "/api/account") return await callLambda(req, res, "/api/account");
    if (pathname === "/api/admin/games") return await callLambda(req, res, "/api/admin/games");
    const game = pathname.match(/^\/api\/games(?:\/([^/]+)(\/[a-z]+)?)?\/?$/);
    if (game) {
      const routeKey = "/api/games" + (game[1] ? "/{gameId}" + (game[2] || "") : "");
      return await callLambda(req, res, routeKey, undefined, game[1] && decodeURIComponent(game[1]));
    }
    const match = pathname.match(/^\/api\/trades\/([^/]+)$/);
    if (match) return await callLambda(req, res, "/api/trades/{transactionId}", decodeURIComponent(match[1]));
    if (pathname.startsWith("/api/")) {
      res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ message: "Not Found" }));
      return;
    }
    serveFile(req, res, decodeURIComponent(pathname));
  } catch (e) {
    console.error(e);
    res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ message: "Internal Server Error" }));
  }
});

server.listen(PORT, () => {
  console.log(`MarketStreet running locally at http://localhost:${PORT}`);
  console.log("Trades, the account and Scenario Mode games are kept in memory and reset when you stop the server (Ctrl+C).");
});
