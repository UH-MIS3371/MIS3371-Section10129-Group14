// MarketStreet Learn: a short quiz that works without an account, one card at a time like an app's first-run screens.
// Welcome → nickname (+ optional class code) → 8 questions with instant feedback → score and class leaderboard
// → invite to create an account. The server keeps the answer key and scores the run (aws/lambda/backend/learn.js).
// learn.html?class=MIS3371 fills in the class code; learn.html?board=MIS3371 shows only the live leaderboard (for a projector).

const LEARN_API = API_BASE + "/learn";
const RUN_KEY = "marketstreet-learn-run"; // the quiz in progress, so a refresh carries on where it was
const params = new URLSearchParams(location.search);
const stage = document.getElementById("stage");

let questions = [];
let run = null; // { runId, name, classCode, index, answers: [{questionId, choice}] }
let boardTimer = null;

// Plain fetch with no sign-in token: these routes are open to visitors
async function learnApi(path, body) {
  let response;
  try {
    response = await fetch(LEARN_API + path, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch (e) {
    throw Object.assign(new Error("Couldn't reach MarketStreet. Check your connection and try again."), { status: 0 });
  }
  const data = await response.json().catch(() => ({}));
  // failMessage() is in app.js: a 5xx with no reason means the server itself is not answering
  if (!response.ok || data.success === false) throw Object.assign(new Error(data.reason || failMessage(response.status)), { status: response.status });
  return data;
}

function saveRun() {
  try {
    if (run) sessionStorage.setItem(RUN_KEY, JSON.stringify(run));
    else sessionStorage.removeItem(RUN_KEY);
  } catch (e) {
    // storage blocked: a refresh starts over
  }
}

function loadRun() {
  try {
    return JSON.parse(sessionStorage.getItem(RUN_KEY));
  } catch (e) {
    return null;
  }
}

function show(...children) {
  clearInterval(boardTimer);
  stage.replaceChildren(...children.flat().filter((c) => c !== null && c !== undefined && c !== false));
  const focus = stage.querySelector("[autofocus]") || stage.querySelector("h1");
  if (focus) focus.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

function progress(index) {
  const bar = document.getElementById("progress");
  bar.hidden = index === null;
  if (index !== null) document.getElementById("progressBar").style.width = (index / questions.length) * 100 + "%";
}

function errorLine(id) {
  return el("p", { class: "learn-error", id, role: "alert" });
}

// ======================= SCREENS =======================

function welcome() {
  progress(null);
  const point = (n, title, text) => el("li", null, el("span", { class: "learn-num mono" }, n), el("div", null, el("strong", null, title), el("span", { class: "muted" }, text)));
  show(
    el("p", { class: "learn-eyebrow" }, "Learn · about 3 minutes"),
    el("h1", { tabindex: "-1" }, "Learn to trade in 8 questions"),
    streakBadge(),
    el("p", { class: "learn-lead" }, "No account needed. Pick a nickname, answer quick questions about stocks, and see where you rank in your class."),
    el("ol", { class: "learn-points" },
      point("1", "Stocks, buying and selling", "What you own and how profit works"),
      point("2", "Shorting and charts", "Betting on a fall, reading candles"),
      point("3", "A real crisis", "What you'd do in September 2008")),
    el("button", { type: "button", class: "btn primary block learn-go", onclick: nameScreen }, "Start"));
}

function nameScreen() {
  progress(null);
  const user = signedInUser();
  const name = el("input", { id: "learnName", type: "text", maxlength: "20", autocomplete: "nickname", required: true, autofocus: true, value: user && !user.isGuest ? user.name : "" });
  const code = el("input", { id: "learnClass", type: "text", maxlength: "12", autocapitalize: "characters", autocomplete: "off", placeholder: "e.g. MIS3371", value: params.get("class") || "" });
  const button = el("button", { type: "submit", class: "btn primary block learn-go" }, "Start the quiz");
  const form = el("form", { class: "learn-form", novalidate: true },
    el("label", { for: "learnName" }, "Nickname"),
    name,
    el("p", { class: "note" }, "Shown on the leaderboard. Don't use your full name."),
    el("label", { for: "learnClass" }, "Class code ", el("span", { class: "muted" }, "(optional)")),
    code,
    el("p", { class: "note" }, "Everyone with the same code shares a leaderboard."),
    errorLine("nameError"),
    button);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!name.value.trim()) return (document.getElementById("nameError").textContent = "Enter a nickname.");
    button.disabled = true;
    try {
      const started = await learnApi("/start", { name: name.value, classCode: code.value });
      run = { runId: started.runId, name: started.name, classCode: started.classCode, index: 0, answers: [] };
      saveRun();
      questionScreen();
    } catch (err) {
      document.getElementById("nameError").textContent = err.message;
      button.disabled = false;
    }
  });
  show(el("p", { class: "learn-eyebrow" }, "Before you start"), el("h1", { tabindex: "-1" }, "What should we call you?"), form,
    el("button", { type: "button", class: "btn link learn-back", onclick: welcome }, "Back"));
}

function questionScreen() {
  const q = questions[run.index];
  progress(run.index);
  const feedback = el("div", { class: "learn-feedback", hidden: true });
  const next = el("button", { type: "button", class: "btn primary block learn-go", hidden: true }, run.index + 1 < questions.length ? "Next question" : "See my score");
  const error = errorLine("answerError");
  const buttons = q.choices.map((text, i) => el("button", { type: "button", class: "learn-choice", "data-choice": i }, text));
  const choose = async (button) => {
    buttons.forEach((b) => (b.disabled = true));
    button.classList.add("picked");
    error.textContent = "";
    try {
      const result = await learnApi("/answer", { questionId: q.id, choice: Number(button.dataset.choice) });
      buttons[result.answer].classList.add("right");
      if (!result.correct) button.classList.add("wrong");
      feedback.className = "learn-feedback " + (result.correct ? "good" : "bad");
      feedback.replaceChildren(el("strong", null, result.correct ? "Correct!" : "Not quite."), " ", result.explain);
      feedback.hidden = false;
      run.answers = run.answers.filter((a) => a.questionId !== q.id).concat({ questionId: q.id, choice: Number(button.dataset.choice) });
      saveRun();
      next.hidden = false;
      next.focus();
    } catch (err) {
      error.textContent = err.message;
      buttons.forEach((b) => (b.disabled = false));
      button.classList.remove("picked");
    }
  };
  buttons.forEach((b) => b.addEventListener("click", () => choose(b)));
  next.addEventListener("click", () => {
    run.index++;
    saveRun();
    if (run.index < questions.length) questionScreen();
    else finish();
  });
  show(
    el("p", { class: "learn-eyebrow" }, el("span", { class: "learn-topic" }, q.topic), el("span", { class: "mono muted" }, "Question " + (run.index + 1) + " of " + questions.length)),
    el("h1", { class: "learn-prompt", tabindex: "-1" }, q.prompt),
    q.visual ? visual(q.visual) : null,
    el("div", { class: "learn-choices", role: "group", "aria-label": "Answers" }, buttons),
    error, feedback, next);
}

async function finish() {
  progress(questions.length);
  show(el("p", { class: "learn-eyebrow" }, "Scoring"), el("h1", { tabindex: "-1" }, "Adding up your score…"));
  try {
    const result = await learnApi("/finish", { runId: run.runId, answers: run.answers });
    markLearnedToday(); // today counts for the streak
    const done = { ...run };
    run = null;
    saveRun();
    resultScreen(done, result);
  } catch (err) {
    // Already scored (a double tap or a refresh after finishing): go to the board instead of failing
    if (err.status === 409) {
      const done = { ...run };
      run = null;
      saveRun();
      return boardScreen(done.classCode, done.runId);
    }
    show(el("h1", { tabindex: "-1" }, "Your score wasn't saved"), el("p", { class: "learn-lead" }, err.message),
      el("button", { type: "button", class: "btn primary block learn-go", onclick: finish }, "Try again"));
  }
}

function resultScreen(done, result) {
  progress(null);
  const user = signedInUser();
  const member = user && !user.isGuest;
  const signUp = "signin.html?view=signUp&name=" + encodeURIComponent(done.name);
  const board = el("div", { class: "learn-board" });
  show(
    el("p", { class: "learn-eyebrow" }, "Nice work, " + done.name),
    el("div", { class: "learn-score" },
      el("span", { class: "mono learn-points-big" }, result.score),
      el("span", { class: "muted" }, "points")),
    el("p", { class: "learn-summary" },
      el("strong", null, result.correct + " of " + result.total + " right"), " · " + result.seconds + " s · ",
      el("strong", null, "#" + result.rank), " of " + plural(result.players, "player") + (result.classCode === "OPEN" ? "" : " in " + result.classCode)),
    streakBadge(),
    board,
    el("a", { class: "btn block", href: "league.html" }, "Play today's League day →"),
    member
      ? el("div", { class: "learn-next" },
        el("h2", null, "Ready for the real thing?"),
        el("p", { class: "muted" }, "Replay the 2008 crash with $100,000 and see if you can beat the market."),
        el("a", { class: "btn primary block learn-go", href: "scenarios.html" }, "Play a Challenge"))
      : el("div", { class: "learn-next" },
        el("h2", null, "Keep going with a free account"),
        el("p", { class: "muted" }, "Get $10,000 in paper money, save your trades, and replay real market crises in Challenges."),
        el("a", { class: "btn primary block learn-go", href: signUp }, "Create a free account"),
        el("a", { class: "btn block", href: "signin.html" }, "I already have an account")),
    el("button", { type: "button", class: "btn link learn-back", onclick: nameScreen }, "Play again"));
  liveBoard(board, done.classCode, done.runId);
}

// learn.html?board=CODE: just the leaderboard, refreshing, for a projector
function boardScreen(classCode, runId) {
  progress(null);
  const board = el("div", { class: "learn-board big" });
  const code = classCode || "OPEN";
  const join = location.origin + location.pathname.replace(/[^/]*$/, "") + "learn.html" + (code === "OPEN" ? "" : "?class=" + encodeURIComponent(code));
  document.body.dataset.qr = join; // the header's QR code button opens this link
  show(
    el("p", { class: "learn-eyebrow" }, "Live leaderboard"),
    el("h1", { tabindex: "-1" }, code === "OPEN" ? "Everyone" : "Class " + code),
    el("p", { class: "learn-lead" }, "Join at ", el("a", { href: join }, join.replace(/^https?:\/\//, ""))),
    board,
    typeof openQr === "function" ? el("button", { type: "button", class: "btn primary block learn-go", onclick: openQr }, "Show QR code") : null,
    el("a", { class: "btn block", href: join }, "Play the quiz"));
  liveBoard(board, code, runId);
}

// Fills the board now and every 5 seconds while it is on screen
function liveBoard(box, classCode, runId) {
  const draw = async () => {
    try {
      const data = await learnApi("/leaderboard?classCode=" + encodeURIComponent(classCode) + (runId ? "&runId=" + encodeURIComponent(runId) : ""));
      const row = (e) => el("li", { class: e.you ? "you" : null },
        el("span", { class: "rank mono" }, e.rank),
        el("span", { class: "name" }, e.name, e.you ? el("span", { class: "you-tag" }, "You") : null),
        el("span", { class: "mono muted" }, e.correct + "/" + e.total),
        el("span", { class: "mono pts" }, e.score));
      box.replaceChildren(
        el("div", { class: "learn-board-head" }, el("h2", null, "Leaderboard"), el("span", { class: "muted" }, plural(data.players, "player"))),
        data.entries.length ? el("ol", null, data.entries.map(row), data.you ? [el("li", { class: "gap", "aria-hidden": "true" }, "…"), row(data.you)] : null)
          : el("p", { class: "empty" }, "No scores yet. Be the first!"));
    } catch (err) {
      if (!box.children.length) box.replaceChildren(el("p", { class: "empty" }, err.message));
    }
  };
  draw();
  clearInterval(boardTimer);
  boardTimer = setInterval(() => document.visibilityState === "visible" && draw(), 5000);
}

// ======================= PICTURES FOR CHART QUESTIONS =======================

const SVG_NS = "http://www.w3.org/2000/svg";
function svg(tag, attrs, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const key in attrs) node.setAttribute(key, attrs[key]);
  node.append(...children);
  return node;
}

function visual(v) {
  if (v.type === "candles") {
    // Two daily candles: a green one (closed higher than it opened) and a red one (closed lower)
    const candle = (x, color, top, bottom, wickTop, wickBottom, label) => [
      svg("line", { x1: x, x2: x, y1: wickTop, y2: wickBottom, stroke: color, "stroke-width": 2 }),
      svg("rect", { x: x - 16, y: top, width: 32, height: bottom - top, rx: 3, fill: color }),
      svg("text", { x, y: 136, "text-anchor": "middle", fill: "#8a8c92", "font-size": 12 }, label)];
    return el("figure", { class: "learn-visual" }, svg("svg", { viewBox: "0 0 240 144", role: "img", "aria-label": "A green candle on the left and a red candle on the right" },
      ...candle(80, "#44a282", 30, 96, 14, 108, "Green"),
      ...candle(160, "#e5566f", 40, 100, 22, 116, "Red")));
  }
  if (v.type === "line") {
    const pts = v.points;
    const max = Math.max(...pts), min = Math.min(...pts);
    const x = (i) => 12 + (i / (pts.length - 1)) * 276;
    const y = (p) => 12 + ((max - p) / (max - min || 1)) * 96;
    const line = pts.map((p, i) => x(i).toFixed(1) + "," + y(p).toFixed(1)).join(" ");
    return el("figure", { class: "learn-visual" }, svg("svg", { viewBox: "0 0 300 132", role: "img", "aria-label": "A price line over six months" },
      svg("line", { x1: 12, x2: 288, y1: 120, y2: 120, stroke: "#3a3a3e" }),
      svg("polyline", { points: line, fill: "none", stroke: "#4a8ad6", "stroke-width": 3, "stroke-linejoin": "round", "stroke-linecap": "round" }),
      svg("text", { x: 12, y: 131, fill: "#8a8c92", "font-size": 10 }, "6 months ago"),
      svg("text", { x: 288, y: 131, fill: "#8a8c92", "font-size": 10, "text-anchor": "end" }, "Today")));
  }
  return null;
}

// ======================= START =======================

(async function startLearn() {
  if (params.has("board")) return boardScreen(params.get("board").toUpperCase().replace(/[^A-Z0-9]/g, ""));
  show(el("p", { class: "learn-eyebrow" }, "Loading"), el("h1", { tabindex: "-1" }, "Getting the questions…"));
  try {
    questions = (await learnApi("/questions")).questions;
  } catch (err) {
    return show(el("h1", { tabindex: "-1" }, "The quiz couldn't load"), el("p", { class: "learn-lead" }, err.message),
      el("button", { type: "button", class: "btn primary block learn-go", onclick: () => location.reload() }, "Try again"));
  }
  const saved = loadRun();
  if (saved && saved.runId && saved.index < questions.length) {
    run = saved;
    return questionScreen();
  }
  if (saved && saved.runId) {
    run = saved;
    return finish();
  }
  welcome();
})();
