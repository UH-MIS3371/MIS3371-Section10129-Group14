"use strict";
// User profiles (USERS_TABLE, key userId) and the signed-in user's own routes.
//   { userId, email, name, role?: "admin" | "user", tokenAdmin, disabled?, tokensValidAfter?, createdAt, lastSeenAt, version }
// role is set by an admin and wins over the Cognito group (tokenAdmin). disabled and tokensValidAfter are
// checked on every request, so a disabled or signed-out user is refused even while their token is unexpired.
//
// Routes:  GET   /api/me                       profile, account summary and counts
//          PATCH /api/me {name}                change the display name
//          POST  /api/me/sign-out-everywhere   every token issued before now stops working
//          POST  /api/account/reset {confirm: "RESET"}   back to the starting cash, no holdings
const { PutCommand } = require("@aws-sdk/lib-dynamodb");
const { scanAll, getItem, saveVersioned, audit } = require("./store");
const { getOrCreateAccount, publicAccount } = require("./accounts");
const { PRICE_CENTS, START_CASH_CENTS } = require("./market-data");

const TOUCH_MS = 5 * 60 * 1000; // lastSeenAt is written at most every 5 minutes
const NAME = /^[A-Za-z0-9 ]{3,20}$/;
const ROUTE = /^\/api\/(me|me\/sign-out-everywhere|account\/reset)\/?$/;

const isAdminProfile = (p) => (p.role ? p.role === "admin" : Boolean(p.tokenAdmin));

function fail(statusCode, reason) {
  return { statusCode, body: { success: false, reason } };
}

// Loads (creating if needed) the signed-in user's profile and applies it to the user.
// Returns { user } or { error: {statusCode, body} }. Without USERS_TABLE the token alone decides.
async function resolveUser(db, user) {
  const table = process.env.USERS_TABLE;
  if (!table) return { user };
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 2; attempt++) {
    let p = await getItem(db, table, { userId: user.userId });
    const stale = !p || p.email !== user.email || p.tokenAdmin !== user.isAdmin || Date.now() - Date.parse(p.lastSeenAt) > TOUCH_MS;
    if (stale) {
      const next = { createdAt: now, name: user.name, ...p, userId: user.userId, email: user.email, tokenAdmin: user.isAdmin, lastSeenAt: now };
      const saved = await saveVersioned(db, table, next, "userId");
      if (!saved) continue; // someone else saved it first: read it again
      p = saved;
    }
    if (p.disabled) return { error: fail(403, "This account is disabled. Contact an admin.") };
    if (p.tokensValidAfter && user.issuedAt * 1000 < Date.parse(p.tokensValidAfter)) return { error: fail(401, "Please sign in again.") };
    return { user: { ...user, name: p.name || user.name, isAdmin: isAdminProfile(p), profile: p } };
  }
  return { error: fail(409, "Please try again.") };
}

function holdingsValue(holdings) {
  return Object.entries(holdings || {}).reduce((sum, [s, q]) => sum + (PRICE_CENTS[s] || 0) * q, 0);
}

async function getMe(db, user) {
  const account = await getOrCreateAccount(db, process.env.ACCOUNTS_TABLE, user.userId, new Date().toISOString());
  const trades = (await scanAll(db, process.env.TABLE_NAME)).filter((t) => t.userId === user.userId);
  const games = (await scanAll(db, process.env.GAMES_TABLE)).filter((g) => g.ownerId === user.userId);
  const p = user.profile || {};
  return {
    statusCode: 200,
    body: {
      success: true,
      user: { userId: user.userId, email: user.email, name: user.name, isAdmin: user.isAdmin, createdAt: p.createdAt || account.createdAt },
      account: { ...publicAccount(account), holdingsValueCents: holdingsValue(account.holdings), startCashCents: START_CASH_CENTS, resetAt: account.resetAt || null },
      stats: {
        trades: trades.filter((t) => t.status === "Accepted").length,
        rejected: trades.filter((t) => t.status === "Rejected").length,
        games: games.length,
        finishedGames: games.filter((g) => g.status === "over").length,
        stars: games.reduce((n, g) => n + (g.result ? g.result.stars : 0), 0)
      }
    }
  };
}

async function updateProfile(db, user, change) {
  if (!user.profile) return fail(500, "Profiles are not set up on this server.");
  for (let attempt = 0; attempt < 2; attempt++) {
    const p = attempt === 0 ? user.profile : await getItem(db, process.env.USERS_TABLE, { userId: user.userId });
    if (await saveVersioned(db, process.env.USERS_TABLE, { ...p, ...change }, "userId")) return null;
  }
  return fail(409, "Your profile changed somewhere else. Reload and try again.");
}

async function patchMe(db, user, body) {
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (!NAME.test(name)) return fail(400, "Display name must be 3–20 letters, numbers or spaces.");
  const problem = await updateProfile(db, user, { name });
  if (problem) return problem;
  await audit(db, user, "profile.rename", { targetId: user.userId, targetEmail: user.email, before: { name: user.name }, after: { name } });
  return { statusCode: 200, body: { success: true, name } };
}

async function signOutEverywhere(db, user) {
  const problem = await updateProfile(db, user, { tokensValidAfter: new Date().toISOString() });
  if (problem) return problem;
  await audit(db, user, "session.sign_out_all", { targetId: user.userId, targetEmail: user.email });
  return { statusCode: 200, body: { success: true } };
}

// Puts the account back to the starting cash with no holdings (D-10). Trade records are kept (NFR-4).
async function resetAccount(db, userId) {
  const table = process.env.ACCOUNTS_TABLE;
  const now = new Date().toISOString();
  const before = await getOrCreateAccount(db, table, userId, now);
  const after = { ...before, cashCents: START_CASH_CENTS, holdings: {}, resetAt: now, updatedAt: now };
  await writeAccount(db, table, before, after);
  return { before, after };
}

// Saves a changed account only if no trade changed it since it was read (updatedAt is set by every commit)
async function writeAccount(db, table, before, after) {
  await db.send(new PutCommand({
    TableName: table, Item: after,
    ConditionExpression: "#v = :read", ExpressionAttributeNames: { "#v": "updatedAt" }, ExpressionAttributeValues: { ":read": before.updatedAt }
  }));
}

async function postReset(db, user, body) {
  if (body.confirm !== "RESET") return fail(400, "Type RESET to confirm.");
  const { before, after } = await resetAccount(db, user.userId);
  await audit(db, user, "account.reset", { targetId: user.userId, targetEmail: user.email, before: publicAccount(before), after: publicAccount(after) });
  return { statusCode: 200, body: { success: true, account: publicAccount(after) } };
}

function parseBody(event) {
  let body = event.body;
  if (typeof body !== "string") return body && typeof body === "object" ? body : {};
  if (event.isBase64Encoded) body = Buffer.from(body, "base64").toString("utf8");
  try {
    const parsed = JSON.parse(body);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
}

// Returns null when the request is not for one of these routes
async function handleMe(db, event, method, user) {
  const match = (event.rawPath || "").match(ROUTE);
  if (!match) return null;
  const route = method + " " + match[1];
  try {
    if (route === "GET me") return await getMe(db, user);
    if (route === "PATCH me") return await patchMe(db, user, parseBody(event));
    if (route === "POST me/sign-out-everywhere") return await signOutEverywhere(db, user);
    if (route === "POST account/reset") return await postReset(db, user, parseBody(event));
    return fail(405, "That method is not supported here.");
  } catch (e) {
    console.log("Profile request failed:", e);
    return fail(500, method === "GET" ? "Your profile could not be loaded. Please try again." : "Nothing was changed. Please try again.");
  }
}

module.exports = { resolveUser, handleMe, isAdminProfile, holdingsValue, resetAccount, writeAccount, updateProfile, parseBody, fail };
