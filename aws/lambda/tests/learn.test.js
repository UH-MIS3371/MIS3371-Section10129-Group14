"use strict";
const test = require("node:test");
const assert = require("node:assert");

const { installFakeDynamoDB } = require("../local-server");
const fake = installFakeDynamoDB();
process.env.TABLE_NAME = "Trades-test";
process.env.ACCOUNTS_TABLE = "Accounts-test";
process.env.GAMES_TABLE = "Games-test";
process.env.USERS_TABLE = "Users-test";
process.env.AUDIT_TABLE = "Audit-test";
process.env.LEARN_TABLE = "Learn-test";
process.env.AWS_REGION = "us-east-1";

const { handler } = require("../index");
const { QUESTIONS } = require("../backend/learn");

// No authorizer claims: the Learn routes are open to visitors without an account
async function call(method, rawPath, body) {
  const [path, query] = rawPath.split("?");
  const response = await handler({
    rawPath: path,
    queryStringParameters: query ? Object.fromEntries(new URLSearchParams(query)) : undefined,
    requestContext: { http: { method } },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : {} };
}

const allRight = () => QUESTIONS.map((q) => ({ questionId: q.id, choice: q.answer }));
const wrongOn = (n) => QUESTIONS.map((q, i) => ({ questionId: q.id, choice: i < n ? (q.answer + 1) % q.choices.length : q.answer }));

async function play(name, classCode, answers) {
  const started = await call("POST", "/api/learn/start", { name, classCode });
  assert.strictEqual(started.status, 200);
  return { runId: started.body.runId, done: await call("POST", "/api/learn/finish", { runId: started.body.runId, answers }) };
}

test("questions are public and never include the answers", async () => {
  const res = await call("GET", "/api/learn/questions");
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.questions.length, QUESTIONS.length);
  assert.ok(!/"answer"|explain/.test(JSON.stringify(res.body)));
});

test("other routes still need sign-in", async () => {
  assert.strictEqual((await call("GET", "/api/account")).status, 401);
});

test("checking one answer returns right or wrong with an explanation", async () => {
  const q = QUESTIONS[0];
  const right = await call("POST", "/api/learn/answer", { questionId: q.id, choice: q.answer });
  assert.strictEqual(right.body.correct, true);
  assert.ok(right.body.explain);
  const wrong = await call("POST", "/api/learn/answer", { questionId: q.id, choice: (q.answer + 1) % q.choices.length });
  assert.strictEqual(wrong.body.correct, false);
  assert.strictEqual(wrong.body.answer, q.answer);
  assert.strictEqual((await call("POST", "/api/learn/answer", { questionId: q.id, choice: 99 })).status, 400);
  assert.strictEqual((await call("POST", "/api/learn/answer", { questionId: "nope", choice: 0 })).status, 404);
});

test("a nickname is required and cleaned", async () => {
  assert.strictEqual((await call("POST", "/api/learn/start", { name: "   " })).status, 400);
  assert.strictEqual((await call("POST", "/api/learn/start", { name: "<script>" })).body.name, "script");
  const res = await call("POST", "/api/learn/start", { name: "  Ana   María  ", classCode: "mis-3371!" });
  assert.strictEqual(res.body.name, "Ana María");
  assert.strictEqual(res.body.classCode, "MIS3371");
  assert.strictEqual((await call("POST", "/api/learn/start", { name: "x".repeat(50) })).body.name.length, 20);
});

test("the server scores the run, and a run is scored only once", async () => {
  const { runId, done } = await play("Perfect", "SCORE", allRight());
  assert.strictEqual(done.status, 200);
  assert.strictEqual(done.body.correct, QUESTIONS.length);
  assert.ok(done.body.score >= QUESTIONS.length * 100);
  assert.strictEqual(done.body.rank, 1);
  const again = await call("POST", "/api/learn/finish", { runId, answers: allRight() });
  assert.strictEqual(again.status, 409);
});

test("a score sent by the browser is ignored, and every question must be answered", async () => {
  const started = await call("POST", "/api/learn/start", { name: "Cheater", classCode: "CHEAT" });
  const partial = await call("POST", "/api/learn/finish", { runId: started.body.runId, answers: allRight().slice(1) });
  assert.strictEqual(partial.status, 400);
  const dupes = allRight().slice(1).concat([{ questionId: QUESTIONS[1].id, choice: QUESTIONS[1].answer }]);
  assert.strictEqual((await call("POST", "/api/learn/finish", { runId: started.body.runId, answers: dupes })).status, 400);
  const res = await call("POST", "/api/learn/finish", { runId: started.body.runId, answers: wrongOn(QUESTIONS.length), score: 99999 });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.correct, 0);
  assert.strictEqual(res.body.score, 0);
  assert.strictEqual((await call("POST", "/api/learn/finish", { runId: "missing", answers: allRight() })).status, 404);
});

test("the leaderboard ranks one class, hides run IDs, and marks you", async () => {
  const best = await play("Best", "BOARD", allRight());
  await play("Middle", "BOARD", wrongOn(2));
  const low = await play("Low", "BOARD", wrongOn(5));
  await play("Elsewhere", "OTHER", allRight());
  const res = await call("GET", "/api/learn/leaderboard?classCode=board&runId=" + low.runId);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body.entries.map((e) => e.name), ["Best", "Middle", "Low"]);
  assert.deepStrictEqual(res.body.entries.map((e) => e.rank), [1, 2, 3]);
  assert.strictEqual(res.body.entries.find((e) => e.you).name, "Low");
  assert.ok(!JSON.stringify(res.body).includes(best.runId));
  assert.strictEqual(res.body.players, 3);
});

test("no class code means the open board", async () => {
  await play("Walk-in", "", allRight());
  const res = await call("GET", "/api/learn/leaderboard");
  assert.strictEqual(res.body.classCode, "OPEN");
  assert.ok(res.body.entries.some((e) => e.name === "Walk-in"));
});

test("a database failure gives a general message", async () => {
  fake.failNext = true;
  const res = await call("POST", "/api/learn/start", { name: "Oops" });
  fake.failNext = false;
  assert.strictEqual(res.status, 500);
  assert.ok(!/secret/.test(JSON.stringify(res.body)));
});
