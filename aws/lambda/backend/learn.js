"use strict";
// Learn: a short quiz for first-time visitors (and classmates during a demo). No account is needed: a player
// gives a nickname and, optionally, a class code so a class sees its own leaderboard.
//
// Routes (no sign-in; API Gateway route ANY /api/learn/{proxy+} has no authorizer):
//   GET  /api/learn/questions                    the questions, without the answers
//   POST /api/learn/start   {name, classCode}    starts a run; the server notes the start time
//   POST /api/learn/answer  {questionId, choice} says whether one answer is right, with a short explanation
//   POST /api/learn/finish  {runId, answers}     checks every answer again, scores the run and saves it (once)
//   GET  /api/learn/leaderboard?classCode=&runId=  the top 10 for a class code, and your own place
//
// The server keeps the answer key and works out the score and the time itself, so a browser can't send its own score.
// Environment: LEARN_TABLE (key runId).
const crypto = require("crypto");
const { scanAll, getItem, saveVersioned } = require("./store");

const ROUTE = /^\/api\/learn\/(questions|start|answer|finish|leaderboard)\/?$/;
const POINTS_PER_ANSWER = 100;
const SPEED_SECONDS = 180; // finishing faster than this earns up to 180 bonus points, scaled by how many were right
const BOARD_SIZE = 10;
const DEFAULT_CLASS = "OPEN";

// choices[answer] is the right one. visual, when present, is drawn by the page (see frontend/learn.js).
const QUESTIONS = [
  {
    id: "stock", topic: "Stocks",
    prompt: "You buy 1 share of Apple. What do you now own?",
    choices: ["A tiny piece of Apple", "A loan to Apple", "An Apple gift card"], answer: 0,
    explain: "A share is a small piece of ownership in a company. If the company does well, your piece is worth more."
  },
  {
    id: "buy", topic: "Buying",
    prompt: "You have $500. Apple costs $185 a share. How many whole shares can you buy?",
    choices: ["1", "2", "3"], answer: 1,
    explain: "2 shares cost $370. A third would make $555, which is more than you have."
  },
  {
    id: "sell", topic: "Selling",
    prompt: "You bought 10 shares at $30 and sold them at $36. What's your profit?",
    choices: ["$6", "$60", "$360"], answer: 1,
    explain: "You made $6 on each share, and you had 10 shares: $6 × 10 = $60."
  },
  {
    id: "rule", topic: "Rules",
    prompt: "You have $1,000. You try to buy 10 shares at $185. What does MarketStreet do?",
    choices: ["Buys them", "Buys 5 instead", "Rejects the order"], answer: 2,
    explain: "10 × $185 = $1,850, more than your cash. MarketStreet rejects it with \"Insufficient cash\" and nothing changes."
  },
  {
    id: "short", topic: "Shorting",
    prompt: "You short a stock at $50, and it falls to $40. What happened?",
    choices: ["You made $10 a share", "You lost $10 a share", "Nothing"], answer: 0,
    explain: "Shorting is a bet the price will fall. You sold at $50 and can buy back at $40, so you keep the $10 difference."
  },
  {
    id: "candle", topic: "Charts",
    prompt: "Which candle shows the price went UP that day?",
    choices: ["The green one", "The red one"], answer: 0,
    visual: { type: "candles" },
    explain: "Green means the day closed higher than it opened. Red means it closed lower."
  },
  {
    id: "trend", topic: "Charts",
    prompt: "What is this stock's trend?",
    choices: ["Going up", "Going down", "Flat"], answer: 1,
    visual: { type: "line", points: [62, 64, 59, 57, 58, 52, 49, 50, 44, 41, 42, 36] },
    explain: "The line has lower highs and lower lows from left to right, so the price is falling over time."
  },
  {
    id: "crisis", topic: "Challenge",
    prompt: "September 2008: Lehman Brothers goes bankrupt and bank stocks are crashing. Which move makes money?",
    choices: ["Buy bank stocks", "Short bank stocks"], answer: 1,
    explain: "When prices fall, a short makes money. Try it yourself in Challenges → 2008 Financial Crisis."
  }
];

const byId = new Map(QUESTIONS.map((q) => [q.id, q]));

function ok(body) {
  return { statusCode: 200, body: { success: true, ...body } };
}

function fail(statusCode, reason) {
  return { statusCode, body: { success: false, reason } };
}

function parseBody(event) {
  try {
    const body = JSON.parse(event.body || "{}");
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch (e) {
    return null;
  }
}

// Letters (any language), numbers, spaces and . - ' _ ; 1 to 20 characters
function cleanName(value) {
  const name = String(value || "").normalize("NFC").replace(/[^\p{L}\p{N} .'_-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 20).trim();
  return name || null;
}

// A–Z and 0–9, up to 12 characters; empty means the open board
function cleanClass(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || DEFAULT_CLASS;
}

const publicQuestion = ({ id, topic, prompt, choices, visual }) => ({ id, topic, prompt, choices, visual });

function score(answers, seconds) {
  const seen = new Set();
  let correct = 0;
  for (const a of Array.isArray(answers) ? answers : []) {
    const q = a && byId.get(a.questionId);
    if (!q || seen.has(q.id)) continue;
    seen.add(q.id);
    if (Number(a.choice) === q.answer) correct++;
  }
  const bonus = Math.round(Math.max(0, SPEED_SECONDS - seconds) * (correct / QUESTIONS.length));
  return { correct, total: QUESTIONS.length, answered: seen.size, points: correct * POINTS_PER_ANSWER + bonus };
}

// Best score first; on a tie, whoever finished faster
const ranked = (runs) => runs.sort((a, b) => b.score - a.score || a.seconds - b.seconds);

async function finishedRuns(db, table, classCode) {
  return ranked((await scanAll(db, table)).filter((r) => r.finishedAt && r.classCode === classCode));
}

async function start(db, table, body) {
  const name = cleanName(body.name);
  if (!name) return fail(400, "Enter a nickname (letters and numbers, up to 20 characters).");
  const run = { runId: crypto.randomUUID(), name, classCode: cleanClass(body.classCode), startedAt: new Date().toISOString() };
  const saved = await saveVersioned(db, table, run, "runId");
  if (!saved) return fail(409, "Please try again.");
  return ok({ runId: run.runId, name: run.name, classCode: run.classCode, total: QUESTIONS.length });
}

function answer(body) {
  const q = byId.get(body.questionId);
  if (!q) return fail(404, "Question not found.");
  const choice = Number(body.choice);
  if (!Number.isInteger(choice) || choice < 0 || choice >= q.choices.length) return fail(400, "Pick one of the answers.");
  return ok({ correct: choice === q.answer, answer: q.answer, explain: q.explain });
}

async function finish(db, table, body) {
  const runId = String(body.runId || "");
  const run = runId && (await getItem(db, table, { runId }));
  if (!run) return fail(404, "This quiz wasn't found. Start again.");
  if (run.finishedAt) return fail(409, "This quiz was already scored.");
  const finishedAt = new Date();
  const seconds = Math.max(1, Math.round((finishedAt - new Date(run.startedAt)) / 1000));
  const result = score(body.answers, seconds);
  if (result.answered < QUESTIONS.length) return fail(400, "Answer every question first.");
  const saved = await saveVersioned(db, table, { ...run, finishedAt: finishedAt.toISOString(), seconds, score: result.points, correct: result.correct, total: result.total }, "runId");
  if (!saved) return fail(409, "This quiz was already scored.");
  const runs = await finishedRuns(db, table, run.classCode);
  const rank = runs.findIndex((r) => r.runId === runId) + 1;
  return ok({ score: result.points, correct: result.correct, total: result.total, seconds, rank, players: runs.length, classCode: run.classCode });
}

async function leaderboard(db, table, query) {
  const classCode = cleanClass(query.classCode);
  const runs = await finishedRuns(db, table, classCode);
  const row = (r, i) => ({ rank: i + 1, name: r.name, score: r.score, correct: r.correct, total: r.total, seconds: r.seconds, you: r.runId === query.runId });
  const entries = runs.slice(0, BOARD_SIZE).map(row);
  const mine = runs.findIndex((r) => r.runId === query.runId);
  return ok({ classCode, players: runs.length, entries, you: mine >= BOARD_SIZE ? row(runs[mine], mine) : null });
}

// Returns null when the request is not for /api/learn, so index.js can route it elsewhere
async function handleLearn(db, event, method) {
  const match = (event.rawPath || "").match(ROUTE);
  if (!match) return null;
  const table = process.env.LEARN_TABLE;
  const action = match[1];
  try {
    if (action === "questions" || action === "leaderboard") {
      if (method !== "GET") return fail(405, "Use GET on /api/learn/" + action + ".");
      if (action === "questions") return ok({ questions: QUESTIONS.map(publicQuestion) });
      if (!table) return fail(500, "The quiz is not set up yet.");
      return await leaderboard(db, table, event.queryStringParameters || {});
    }
    if (method !== "POST") return fail(405, "Use POST on /api/learn/" + action + ".");
    const body = parseBody(event);
    if (!body) return fail(400, "The request body must be JSON.");
    if (action === "answer") return answer(body);
    if (!table) return fail(500, "The quiz is not set up yet.");
    return action === "start" ? await start(db, table, body) : await finish(db, table, body);
  } catch (e) {
    console.log("Learn request failed:", e);
    return fail(500, "The quiz could not be saved. Please try again.");
  }
}

module.exports = { handleLearn, QUESTIONS, cleanName, cleanClass };
