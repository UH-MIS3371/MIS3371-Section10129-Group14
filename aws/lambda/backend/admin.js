"use strict";
// Admin console routes. index.js has already refused (and audited) anyone who is not an admin;
// each handler still checks again, so a routing mistake can never expose these.
//   GET  /api/admin/overview               platform numbers and charts
//   GET  /api/admin/users                  every user with balance, return and activity
//   GET  /api/admin/users/{id}             one user: profile, portfolio, trades, games, audit entries
//   POST /api/admin/users/{id}/actions     {action, reason?, amountCents?, confirm?}
//   GET  /api/admin/trades                 every trade, newest first
//   GET  /api/admin/audit                  the audit log, newest first
const { scanAll, queryAll, getItem, saveVersioned, audit } = require("./store");
const { isAdminProfile, holdingsValue, resetAccount, writeAccount, parseBody, fail } = require("./users");
const { publicAccount } = require("./accounts");
const { PRICE_CENTS, START_CASH_CENTS } = require("./market-data");

const ROUTE = /^\/api\/admin\/(overview|users|trades|audit)(?:\/([^/]+)(?:\/(actions))?)?\/?$/;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ADJUST_CENTS = 10000000; // $100,000 per adjustment

const ok = (body) => ({ statusCode: 200, body: { success: true, ...body } });

async function loadAll(db) {
  const [profiles, accounts, trades, games] = await Promise.all([
    scanAll(db, process.env.USERS_TABLE),
    scanAll(db, process.env.ACCOUNTS_TABLE),
    scanAll(db, process.env.TABLE_NAME),
    scanAll(db, process.env.GAMES_TABLE)
  ]);
  return { profiles, accounts, trades, games };
}

function valueOf(account) {
  return account ? account.cashCents + holdingsValue(account.holdings) : START_CASH_CENTS;
}

// One row per person: everyone with a profile, plus anyone who only has an account (signed in before profiles)
function userRows({ profiles, accounts, trades, games }) {
  const byId = new Map(profiles.map((p) => [p.userId, { profile: p }]));
  for (const a of accounts) byId.set(a.userId, { ...byId.get(a.userId), account: a });
  return [...byId.entries()].map(([userId, { profile = {}, account }]) => {
    const mine = trades.filter((t) => t.userId === userId);
    const lastTrade = mine.reduce((m, t) => (t.submittedAt > m ? t.submittedAt : m), "");
    const value = valueOf(account);
    return {
      userId, email: profile.email || "", name: profile.name || "",
      isAdmin: isAdminProfile(profile), status: profile.disabled ? "Disabled" : "Active",
      cashCents: account ? account.cashCents : START_CASH_CENTS, valueCents: value, returnPct: (value - START_CASH_CENTS) / START_CASH_CENTS,
      trades: mine.filter((t) => t.status === "Accepted").length, rejected: mine.filter((t) => t.status === "Rejected").length,
      games: games.filter((g) => g.ownerId === userId).length,
      createdAt: profile.createdAt || (account && account.createdAt) || null,
      lastSeenAt: [profile.lastSeenAt || "", lastTrade].sort().pop() || null
    };
  });
}

async function overview(db) {
  const data = await loadAll(db);
  const { trades, games } = data;
  const users = userRows(data);
  const now = Date.now();
  const since = (iso, days) => iso && now - Date.parse(iso) <= days * DAY_MS;
  const accepted = trades.filter((t) => t.status === "Accepted");
  const rejected = trades.filter((t) => t.status === "Rejected");
  const finished = games.filter((g) => g.status === "over" && g.result);

  const days = [];
  for (let i = 13; i >= 0; i--) {
    const date = new Date(now - i * DAY_MS).toISOString().slice(0, 10);
    const today = trades.filter((t) => (t.submittedAt || "").startsWith(date));
    days.push({ date, accepted: today.filter((t) => t.status === "Accepted").length, rejected: today.filter((t) => t.status === "Rejected").length });
  }
  const count = (list, key) => [...list.reduce((m, x) => m.set(key(x), (m.get(key(x)) || 0) + 1), new Map())]
    .map(([label, n]) => ({ label, count: n })).sort((a, b) => b.count - a.count);

  return ok({
    kpis: {
      users: users.length,
      newUsers7d: users.filter((u) => since(u.createdAt, 7)).length,
      activeUsers7d: users.filter((u) => since(u.lastSeenAt, 7)).length,
      tradesToday: days[days.length - 1].accepted + days[days.length - 1].rejected,
      trades7d: trades.filter((t) => since(t.submittedAt, 7)).length,
      acceptRate: trades.length ? accepted.length / trades.length : null,
      totalValueCents: users.reduce((s, u) => s + u.valueCents, 0),
      avgReturnPct: users.length ? users.reduce((s, u) => s + u.returnPct, 0) / users.length : null,
      gamesStarted: games.length,
      gamesFinished: finished.length,
      avgStars: finished.length ? finished.reduce((s, g) => s + g.result.stars, 0) / finished.length : null
    },
    tradesByDay: days,
    rejectionReasons: count(rejected, (t) => t.rejectionReason || "Unknown").slice(0, 6),
    topSymbols: count(accepted, (t) => t.stockSymbol).slice(0, 5),
    topUsers: users.slice().sort((a, b) => b.valueCents - a.valueCents).slice(0, 5),
    recentTrades: trades.slice().sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, 8).map((t) => withOwner(t, users))
  });
}

function withOwner(t, users) {
  const u = users.find((x) => x.userId === t.userId);
  return { ...t, ownerEmail: u ? u.email : "", ownerName: u ? u.name : "" };
}

async function userDetail(db, userId) {
  const data = await loadAll(db);
  const row = userRows(data).find((u) => u.userId === userId);
  if (!row) return fail(404, "User not found.");
  const account = data.accounts.find((a) => a.userId === userId);
  const holdings = account ? account.holdings : {};
  const positions = Object.entries(holdings).filter(([, q]) => q > 0)
    .map(([symbol, shares]) => ({ symbol, shares, priceCents: PRICE_CENTS[symbol] || 0, valueCents: (PRICE_CENTS[symbol] || 0) * shares }));
  const log = (await scanAll(db, process.env.AUDIT_TABLE)).filter((e) => e.targetId === userId).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50);
  const profile = data.profiles.find((p) => p.userId === userId) || {};
  const userTrades = await queryAll(db, process.env.TABLE_NAME, process.env.TRADES_USER_INDEX || "userId-submittedAt-index", "userId", userId);
  const userGames = await queryAll(db, process.env.GAMES_TABLE, process.env.GAMES_OWNER_INDEX || "ownerId-updatedAt-index", "ownerId", userId);
  return ok({
    user: { ...row, tokensValidAfter: profile.tokensValidAfter || null },
    account: account ? { ...publicAccount(account), resetAt: account.resetAt || null, updatedAt: account.updatedAt } : null,
    positions,
    trades: userTrades,
    games: userGames.map((g) => ({
      gameId: g.gameId, scenarioId: g.scenarioId, day: g.day, status: g.status,
      stars: g.result ? g.result.stars : null, returnPct: g.result ? g.result.mine : null, createdAt: g.createdAt, updatedAt: g.updatedAt
    })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    audit: log
  });
}

// Changes one profile field set, retrying once if the profile was saved in between
async function changeProfile(db, userId, change) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const p = (await getItem(db, process.env.USERS_TABLE, { userId })) || { userId, createdAt: new Date().toISOString() };
    const saved = await saveVersioned(db, process.env.USERS_TABLE, { ...p, ...change }, "userId");
    if (saved) return { before: p, after: saved };
  }
  throw new Error("Profile changed during the update");
}

async function act(db, admin, userId, body) {
  const action = body.action;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : "";
  const data = await loadAll(db);
  const target = userRows(data).find((u) => u.userId === userId);
  if (!target) return fail(404, "User not found.");
  const self = userId === admin.userId;
  const entry = (name, before, after, strict, result) => audit(db, admin, name, { targetId: userId, targetEmail: target.email, before, after, reason: reason || undefined, ...(result && { result }) }, { strict });
  const run = async (name, before, after, apply) => {
    try {
      await entry(name, before, after, true);
    } catch (e) {
      return fail(500, "Nothing was changed. Please try again.");
    }
    try {
      return await apply();
    } catch (e) {
      await entry(name, before, after, false, "failure");
      throw e;
    }
  };
  const profile = data.profiles.find((p) => p.userId === userId) || {};

  if (action === "reset-account") {
    if (body.confirm !== (target.email || userId)) return fail(400, "Type the user's email to confirm.");
    const old = data.accounts.find((a) => a.userId === userId) || { cashCents: START_CASH_CENTS, holdings: {} };
    return run("account.reset", publicAccount(old), { cashCents: START_CASH_CENTS, holdings: {} }, async () => {
      await resetAccount(db, userId);
      return ok({ message: "Account reset to $" + (START_CASH_CENTS / 100).toLocaleString("en-US") + "." });
    });
  }
  if (action === "adjust-cash") {
    const amount = body.amountCents;
    if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > MAX_ADJUST_CENTS) return fail(400, "Enter an amount between −$100,000 and $100,000.");
    const before = data.accounts.find((a) => a.userId === userId);
    if (!before) return fail(409, "This user has no account yet.");
    if (before.cashCents + amount < 0) return fail(400, "Cash can't go below $0.");
    const after = { ...before, cashCents: before.cashCents + amount, updatedAt: new Date().toISOString() };
    return run("account.cash_adjust", { cashCents: before.cashCents }, { cashCents: after.cashCents }, async () => {
      await writeAccount(db, process.env.ACCOUNTS_TABLE, before, after);
      return ok({ message: "Cash adjusted." });
    });
  }
  if (!process.env.USERS_TABLE) return fail(500, "Profiles are not set up on this server.");
  if (action === "disable" || action === "enable") {
    if (self) return fail(400, "You can't disable your own account.");
    return run("user." + action, { disabled: Boolean(profile.disabled) }, { disabled: action === "disable" }, async () => {
      await changeProfile(db, userId, { disabled: action === "disable" });
      return ok({ message: action === "disable" ? "User disabled." : "User enabled." });
    });
  }
  if (action === "make-admin" || action === "remove-admin") {
    const makeAdmin = action === "make-admin";
    if (!makeAdmin && self) return fail(400, "You can't remove your own admin role.");
    if (!makeAdmin && userRows(data).filter((u) => u.isAdmin).length <= 1) return fail(400, "There must always be at least one admin.");
    return run(makeAdmin ? "user.role.promote" : "user.role.demote", { isAdmin: isAdminProfile(profile) }, { isAdmin: makeAdmin }, async () => {
      await changeProfile(db, userId, { role: makeAdmin ? "admin" : "user" });
      return ok({ message: makeAdmin ? "Now an admin." : "Admin role removed." });
    });
  }
  if (action === "sign-out") {
    return run("session.sign_out_all", undefined, undefined, async () => {
      await changeProfile(db, userId, { tokensValidAfter: new Date().toISOString() });
      return ok({ message: "Signed out of every device." });
    });
  }
  return fail(400, "Unknown action.");
}

async function allTrades(db, event) {
  const q = event.queryStringParameters || {};
  const data = await loadAll(db);
  const users = userRows(data);
  const trades = data.trades
    .filter((t) => (!q.status || t.status === q.status) && (!q.symbol || t.stockSymbol === q.symbol) && (!q.userId || t.userId === q.userId))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .slice(0, 1000)
    .map((t) => withOwner(t, users));
  return ok({ trades });
}

async function auditLog(db) {
  const entries = (await scanAll(db, process.env.AUDIT_TABLE)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 1000);
  return ok({ entries });
}

// Returns null when the request is not for one of these routes
async function handleAdmin(db, event, method, user) {
  const match = (event.rawPath || "").match(ROUTE);
  if (!match) return null;
  if (!user.isAdmin) return fail(403, "Admins only.");
  const [, section, id, sub] = match;
  try {
    if (method === "GET" && section === "overview" && !id) return await overview(db);
    if (method === "GET" && section === "users" && !id) return ok({ users: userRows(await loadAll(db)) });
    if (method === "GET" && section === "users" && !sub) return await userDetail(db, decodeURIComponent(id));
    if (method === "POST" && section === "users" && sub === "actions") return await act(db, user, decodeURIComponent(id), parseBody(event));
    if (method === "GET" && section === "trades" && !id) return await allTrades(db, event);
    if (method === "GET" && section === "audit" && !id) return await auditLog(db);
    return fail(405, "That method is not supported here.");
  } catch (e) {
    console.log("Admin request failed:", e);
    if (e.name === "ConditionalCheckFailedException") return fail(409, "The account changed while you were editing it. Reload and try again.");
    return fail(500, method === "GET" ? "This could not be loaded. Please try again." : "Nothing was changed. Please try again.");
  }
}

module.exports = { handleAdmin };
