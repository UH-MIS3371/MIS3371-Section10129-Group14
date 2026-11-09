"use strict";
// Scenario Mode on the server: start a game, place orders, close positions and end trading days.
// The rules live in game-core.js; this file loads and saves games in DynamoDB (table GAMES_TABLE, key gameId).
//
// Controls (Week 12):
// - The server sets every official value: the game ID, times, prices and the trade records.
// - Each action carries a requestId. A retried click with the same requestId is applied once.
// - Each save only succeeds if the game still has the version that was read (no lost or doubled updates).
// - Errors say what to fix, or that nothing was saved; internal details stay in CloudWatch.
// - Each game belongs to the user who started it. Only that user may play it; an admin may also look at it.
const crypto = require("crypto");
const { GetCommand, PutCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const core = require("./game-core");
const SCENARIOS = require("./scenario-data.json");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROUTE = /^\/api\/games(?:\/([^/]+)(?:\/(orders|close|advance))?)?\/?$/;
const ADMIN_ROUTE = /^\/api\/admin\/games\/?$/;
const LEADERBOARD_ROUTE = /^\/api\/leaderboard\/?$/;
const LEADERBOARD_SIZE = 10;
const MAX_ORDERS = 1000;     // per game; keeps the saved game far below DynamoDB's 400 KB item limit
const RECENT_REQUESTS = 20;  // requestIds remembered per game

function fail(statusCode, reason) {
  return { statusCode, body: { success: false, reason } };
}

// The game as the browser sees it: everything except the request bookkeeping
function ok(statusCode, game, extra) {
  const { recentRequests, ...visible } = game;
  return { statusCode, body: { success: true, ...extra, game: visible } };
}

function parseBody(event) {
  let body = event.body;
  if (typeof body !== "string") return body && typeof body === "object" ? body : null;
  if (event.isBase64Encoded) body = Buffer.from(body, "base64").toString("utf8");
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
}

async function load(db, gameId) {
  const found = await db.send(new GetCommand({ TableName: process.env.GAMES_TABLE, Key: { gameId } }));
  return found.Item;
}

// A new game must not overwrite another; an update must still have the version it was read with
async function save(db, game, readVersion) {
  const params = { TableName: process.env.GAMES_TABLE, Item: game };
  if (readVersion === undefined) {
    params.ConditionExpression = "attribute_not_exists(gameId)";
  } else {
    params.ConditionExpression = "#v = :read";
    params.ExpressionAttributeNames = { "#v": "version" };
    params.ExpressionAttributeValues = { ":read": readVersion };
  }
  await db.send(new PutCommand(params));
}

// POST /api/games {scenarioId}. The owner comes from the login token, never from the request body.
async function createGame(db, body, user) {
  const s = body && SCENARIOS.find((x) => x.id === body.scenarioId);
  if (!s) return fail(400, "Choose one of the scenarios.");
  const now = new Date().toISOString();
  const game = {
    gameId: crypto.randomUUID(), version: 1, ownerId: user.userId, ownerEmail: user.email, ownerName: user.name,
    createdAt: now, updatedAt: now, recentRequests: [], ...core.newGame(s)
  };
  await save(db, game);
  return ok(201, game);
}

// Orders and closes happen at the game's current day. The moment within the day (progress) comes from
// the browser's clock, but it can only move forward, and a day that has already ended can't be traded.
function atCurrentMoment(g, body) {
  if (g.status !== "active") return fail(409, "This scenario is over.");
  if (body.day !== g.day) return fail(409, "The trading day has changed. Reload the game to continue.");
  const progress = Number(body.progress);
  if (!(progress >= 0 && progress <= 1)) return fail(400, "progress must be between 0 and 1.");
  g.progress = Math.max(g.progress, Math.min(progress, 0.999));
  return null;
}

// Each action checks the request, then changes the game with the shared rules
const ACTIONS = {
  orders: (body) => (s, g) => {
    const wrong = atCurrentMoment(g, body);
    if (wrong) return wrong;
    if (g.log.filter((t) => t.who === "You").length >= MAX_ORDERS) return fail(400, "This game has reached its order limit.");
    const outcome = core.placeOrder(s, g, body.side, body.symbol, Math.round(Number(body.amountCents)));
    return outcome.error ? fail(400, outcome.error) : { trade: outcome.trade };
  },
  close: (body) => (s, g) => {
    const wrong = atCurrentMoment(g, body);
    if (wrong) return wrong;
    const outcome = core.closePosition(s, g, body.symbol, body.part === 0.5 ? 0.5 : 1);
    return outcome.error ? fail(400, outcome.error) : { trade: outcome.trade };
  },
  // Ends today, or every day until the morning of untilDay (used by "Next headline"); past the end, finishes the game
  advance: (body) => (s, g) => {
    if (g.status !== "active") return fail(409, "This scenario is over.");
    if (body.day !== g.day) return fail(409, "The trading day has changed. Reload the game to continue.");
    const until = Number.isInteger(body.untilDay) ? Math.min(body.untilDay, s.dates.length) : g.day + 1;
    do core.closeDay(s, g); while (g.status === "active" && g.day < until);
    return {};
  }
};

// Runs one action. The same requestId twice returns the game without applying the action again.
// If another request saved the game in between, it reloads and tries once more.
async function act(db, gameId, body, apply, user) {
  if (typeof body.requestId !== "string" || !UUID.test(body.requestId)) return fail(400, "A requestId is required.");
  for (let attempt = 0; attempt < 2; attempt++) {
    const game = await load(db, gameId);
    if (!game) return fail(404, "Game not found.");
    if (game.ownerId !== user.userId) return fail(403, "This game belongs to another player.");
    if (game.recentRequests.includes(body.requestId)) return ok(200, game, { duplicate: true });
    const readVersion = game.version;
    const outcome = apply(SCENARIOS.find((s) => s.id === game.scenarioId), game);
    if (outcome.statusCode) return outcome;
    game.recentRequests = game.recentRequests.concat(body.requestId).slice(-RECENT_REQUESTS);
    game.version = readVersion + 1;
    game.updatedAt = new Date().toISOString();
    try {
      await save(db, game, readVersion);
      return ok(200, game, outcome);
    } catch (e) {
      if (e.name !== "ConditionalCheckFailedException") throw e;
    }
  }
  return fail(409, "This game was changed somewhere else. Reload the game to continue.");
}

// GET /api/admin/games: a short summary of every game, newest first. The role is checked here on the
// server; hiding the admin page from other users would not be protection on its own.
async function listGames(db, user) {
  if (!user.isAdmin) return fail(403, "Only admins can see every game.");
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await db.send(new ScanCommand({
      TableName: process.env.GAMES_TABLE,
      ProjectionExpression: "gameId, ownerEmail, scenarioId, #d, #s, #r, updatedAt",
      ExpressionAttributeNames: { "#d": "day", "#s": "status", "#r": "result" },
      ExclusiveStartKey
    }));
    items.push(...page.Items);
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  const games = items.map((g) => ({
    gameId: g.gameId, ownerEmail: g.ownerEmail, scenarioId: g.scenarioId, day: g.day, status: g.status,
    stars: g.result ? g.result.stars : null, returnPct: g.result ? g.result.mine : null, updatedAt: g.updatedAt
  })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { statusCode: 200, body: { success: true, games } };
}

// GET /api/leaderboard?scenario=<id>: the best finished game of each player in one scenario, highest return
// first. The ranking uses the results the server saved; only display names are shown, never emails.
async function leaderboard(db, event, user) {
  const scenarioId = (event.queryStringParameters || {}).scenario;
  if (!SCENARIOS.some((s) => s.id === scenarioId)) return fail(400, "Choose one of the scenarios.");
  const items = [];
  let ExclusiveStartKey;
  do {
    const page = await db.send(new ScanCommand({
      TableName: process.env.GAMES_TABLE,
      FilterExpression: "scenarioId = :s AND #st = :over",
      ProjectionExpression: "ownerId, ownerName, #r, updatedAt, scenarioId, #st",
      ExpressionAttributeNames: { "#r": "result", "#st": "status" },
      ExpressionAttributeValues: { ":s": scenarioId, ":over": "over" },
      ExclusiveStartKey
    }));
    items.push(...page.Items);
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  const best = new Map();
  for (const g of items) {
    if (g.scenarioId !== scenarioId || g.status !== "over" || !g.result || !g.ownerId) continue;
    const kept = best.get(g.ownerId);
    if (!kept || g.result.mine > kept.result.mine) best.set(g.ownerId, g);
  }
  const entries = [...best.values()].sort((a, b) => b.result.mine - a.result.mine).slice(0, LEADERBOARD_SIZE).map((g, i) => ({
    rank: i + 1, name: g.ownerName || "Player", returnPct: g.result.mine, stars: g.result.stars, finishedAt: g.updatedAt, you: g.ownerId === user.userId
  }));
  return { statusCode: 200, body: { success: true, scenarioId, entries } };
}

// Returns null when the request is not for /api/games, so index.js can route it elsewhere
async function handleGames(db, event, method, user) {
  const path = event.rawPath || "";
  const match = path.match(ROUTE);
  const board = LEADERBOARD_ROUTE.test(path);
  if (!match && !board && !ADMIN_ROUTE.test(path)) return null;
  if (!process.env.GAMES_TABLE) {
    console.log("GAMES_TABLE environment variable is not set.");
    return fail(500, "The game could not be saved. Please try again.");
  }
  if (board) {
    try {
      return method === "GET" ? await leaderboard(db, event, user) : fail(405, "Use GET on /api/leaderboard.");
    } catch (e) {
      console.log("Leaderboard failed:", e);
      return fail(500, "The leaderboard could not be loaded. Please try again.");
    }
  }
  if (!match) {
    try {
      return method === "GET" ? await listGames(db, user) : fail(405, "Use GET on /api/admin/games.");
    } catch (e) {
      console.log("Game list failed:", e);
      return fail(500, "The games could not be loaded. Please try again.");
    }
  }
  const action = match[2];
  const gameId = (event.pathParameters && event.pathParameters.gameId) || match[1];
  try {
    if (method === "POST" && !gameId) return await createGame(db, parseBody(event), user);
    if (!gameId || !UUID.test(gameId)) return fail(404, "Game not found.");
    if (method === "GET" && !action) {
      const game = await load(db, gameId);
      if (!game) return fail(404, "Game not found.");
      if (game.ownerId !== user.userId && !user.isAdmin) return fail(403, "This game belongs to another player.");
      return ok(200, game);
    }
    if (method === "POST" && action) {
      const body = parseBody(event);
      if (!body) return fail(400, "A JSON request body is required.");
      return await act(db, gameId, body, ACTIONS[action](body), user);
    }
    return fail(405, "Use GET or POST on /api/games.");
  } catch (e) {
    console.log("Game request failed:", e);
    return fail(500, method === "GET" ? "The game could not be loaded. Please try again." : "Your action was NOT saved. Please try again.");
  }
}

module.exports = { handleGames };
