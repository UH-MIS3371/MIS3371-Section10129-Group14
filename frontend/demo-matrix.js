// Test matrix on the demo page: sends the Milestone 4 test cases to the API (the same cases and expected results as
// Testing/Final-Milestone/run-matrix.js, which writes the files) and shows expected next to actual, one row at a time.
// Every row is a real request. The run starts by resetting the signed-in user's paper account to $10,000.00, so the
// preconditions in the matrix hold. In guest mode the same cases run in the browser and nothing is sent to AWS.
// Loaded after demo.js.

(() => {
  const root = document.getElementById("matrix");
  if (!root) return;

  const money$ = (c) => money(c);
  const form = (symbol, side, shares) => "Stock " + symbol + " · " + side + " · Shares " + shares + " · Order type Market";
  const order = (symbol, tradeType, quantity, extra = {}) => ({ symbol, tradeType, quantity, orderType: "Market", ...extra });
  const reply = (r) => r.status + " " + (r.body.status || (r.body.success ? "OK" : "ERROR"));
  const rejected = (r, reason) => r.status === 400 && r.body.status === "REJECTED" && r.body.reason === reason;
  const pause = (ms) => new Promise((done) => setTimeout(done, ms));

  // anon: send no sign-in token at all (to show that API Gateway refuses it)
  async function call(method, path, body, anon) {
    const init = { method, headers: {} };
    if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = typeof body === "string" ? body : JSON.stringify(body);
    }
    const res = anon ? await fetch(API_BASE + path, init) : await authFetch(API_BASE + path, init);
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }

  const cash = async () => (await call("GET", "/account")).body.account.cashCents;

  // Each case: id, type, name, inputs, expected, run() -> { actual, ok } (ok null means not run, with the reason in actual)
  function cases(ids) {
    const guest = signedInUser().isGuest;
    const admin = signedInUser().isAdmin;
    let r;
    const list = [];
    const add = (id, type, name, inputs, expected, run) => list.push({ id, type, name, inputs, expected, run });

    add("T01", "Valid", "Buy 1 share of AAPL", "Precondition: new account, $10,000.00. " + form("AAPL", "Buy", 1), "200 ACCEPTED; confirmation number returned; cash becomes $9,814.50; record saved", async () => {
      r = await call("POST", "/trades", order("AAPL", "Buy", 1));
      ids.t01 = r.body.transactionId;
      const c = await cash();
      return { actual: reply(r) + "; confirmation " + ids.t01 + "; cash " + money$(c) + "; persisted " + r.body.persisted, ok: r.status === 200 && r.body.status === "ACCEPTED" && r.body.persisted === true && /^[0-9a-f-]{36}$/.test(ids.t01) && c === 981450 };
    });
    add("T02", "Valid", "Sell the share just bought", "Precondition: T01 done. " + form("AAPL", "Sell", 1), "200 ACCEPTED; cash returns to $10,000.00", async () => {
      r = await call("POST", "/trades", order("AAPL", "Sell", 1));
      const c = await cash();
      return { actual: reply(r) + "; cash " + money$(c), ok: r.status === 200 && r.body.status === "ACCEPTED" && c === 1000000 };
    });

    const invalid = [
      ["T03", "Quantity 0", form("AAPL", "Buy", 0), order("AAPL", "Buy", 0), "Quantity must be a positive whole number."],
      ["T04", "Quantity 1.5 (fraction)", form("AAPL", "Buy", "1.5"), order("AAPL", "Buy", 1.5), "Quantity must be a positive whole number."],
      ["T05", "Quantity -3 (negative)", form("AAPL", "Buy", -3), order("AAPL", "Buy", -3), "Quantity must be a positive whole number."],
      ["T06", "Quantity sent as text (bypassing the browser)", "API only: quantity \"2\" as a string", order("AAPL", "Buy", "2"), "Quantity must be a positive whole number."],
      ["T07", "Unknown stock symbol", form("XYZ", "Buy", 1), order("XYZ", "Buy", 1), "Stock not found."],
      ["T08", "Invalid trade type", "API only: trade type Hold", order("AAPL", "Hold", 1), "Trade type must be Buy or Sell."],
      ["T09", "Limit order (not supported, BR-9)", "API only: order type Limit", order("AAPL", "Buy", 1, { orderType: "Limit" }), "Limit orders are not supported."]
    ];
    for (const [id, name, inputs, body, reason] of invalid) {
      add(id, "Invalid", name, inputs, "400 REJECTED, \"" + reason + "\"; a Rejected record is saved; cash unchanged", async () => {
        const before = await cash();
        r = await call("POST", "/trades", body);
        ids[id] = r.body.transactionId;
        const after = await cash();
        return { actual: reply(r) + ", \"" + r.body.reason + "\"; record " + (r.body.persisted ? "saved" : "not saved") + "; cash " + money$(after), ok: rejected(r, reason) && r.body.persisted === true && before === after };
      });
    }
    add("T10", "Invalid", "Empty request body", "API only: POST with no body", "400 REJECTED, \"A JSON request body is required.\"", async () => {
      r = await call("POST", "/trades", "");
      return { actual: reply(r) + ", \"" + r.body.reason + "\"", ok: rejected(r, "A JSON request body is required.") };
    });

    add("T11", "Boundary", "Largest affordable Buy is accepted (82 × $121.40 = $9,954.80)", "Precondition: $10,000.00, no holdings. " + form("NVDA", "Buy", 82), "200 ACCEPTED; cash becomes $45.20", async () => {
      r = await call("POST", "/trades", order("NVDA", "Buy", 82));
      const c = await cash();
      return { actual: reply(r) + "; cash " + money$(c), ok: r.status === 200 && c === 4520 };
    });
    add("T12", "Boundary", "One more share than the cash covers is rejected", "Precondition: T11 done (cash $45.20). " + form("NVDA", "Buy", 1), "400 REJECTED, \"Insufficient cash.\"; cash unchanged", async () => {
      r = await call("POST", "/trades", order("NVDA", "Buy", 1));
      const c = await cash();
      return { actual: reply(r) + ", \"" + r.body.reason + "\"; cash " + money$(c), ok: rejected(r, "Insufficient cash.") && c === 4520 };
    });
    add("T13", "Boundary", "Sell exactly the shares owned is accepted", "Precondition: T11 done (owns 82 NVDA). " + form("NVDA", "Sell", 82), "200 ACCEPTED; holdings become 0; cash returns to $10,000.00", async () => {
      r = await call("POST", "/trades", order("NVDA", "Sell", 82));
      const c = await cash();
      return { actual: reply(r) + "; cash " + money$(c), ok: r.status === 200 && c === 1000000 };
    });
    add("T14", "Boundary", "Sell one more share than owned is rejected (no short selling)", "Precondition: owns 0 NVDA. " + form("NVDA", "Sell", 1), "400 REJECTED, \"Insufficient shares.\"; cash unchanged", async () => {
      r = await call("POST", "/trades", order("NVDA", "Sell", 1));
      return { actual: reply(r) + ", \"" + r.body.reason + "\"", ok: rejected(r, "Insufficient shares.") };
    });
    add("T15", "Business rule", "Retried order is not placed twice (duplicate control)", "Same order sent twice with the same requestId: " + form("MSFT", "Buy", 1), "First 200 ACCEPTED; second returns the first result with duplicate: true; cash debited once ($412.30)", async () => {
      const requestId = crypto.randomUUID();
      const a = await call("POST", "/trades", order("MSFT", "Buy", 1, { requestId }));
      const b = await call("POST", "/trades", order("MSFT", "Buy", 1, { requestId }));
      const c = await cash();
      return { actual: reply(a) + " then " + reply(b) + " duplicate=" + b.body.duplicate + ", same confirmation: " + (a.body.transactionId === b.body.transactionId) + "; cash " + money$(c), ok: a.status === 200 && b.body.duplicate === true && a.body.transactionId === b.body.transactionId && c === 1000000 - 41230 };
    });

    add("T16", "Retrieval", "Retrieve an Accepted transaction by confirmation number", "Confirmation number from T01 (filled in when it runs)", "200; status Accepted with the stored order, price, total and times", async () => {
      r = await call("GET", "/trades/" + ids.t01);
      const t = r.body.trade || {};
      return { actual: r.status + " status " + t.status + ", " + t.tradeType + " " + t.shareQuantity + " " + t.stockSymbol + " at " + t.executionPrice + ", confirmation " + t.transactionId, ok: r.status === 200 && t.status === "Accepted" && t.transactionId === ids.t01 };
    });
    add("T17", "Retrieval", "Retrieve a Rejected transaction (rejections are stored)", "Confirmation number from T03 (filled in when it runs)", "200; status Rejected with rejectionReason and category Rule", async () => {
      r = await call("GET", "/trades/" + ids.T03);
      const t = r.body.trade || {};
      return { actual: r.status + " status " + t.status + ", \"" + t.rejectionReason + "\", category " + t.rejectionCategory, ok: r.status === 200 && t.status === "Rejected" && t.rejectionCategory === "Rule" };
    });
    add("T18", "Retrieval", "Confirmation number that does not exist", "00000000-0000-4000-8000-000000000000", "404 \"Trade not found.\"", async () => {
      r = await call("GET", "/trades/00000000-0000-4000-8000-000000000000");
      return { actual: r.status + " \"" + r.body.reason + "\"", ok: r.status === 404 && r.body.reason === "Trade not found." };
    });
    add("T19", "Retrieval", "Malformed confirmation number", "abc123", "404 \"Trade not found.\"", async () => {
      r = await call("GET", "/trades/abc123");
      return { actual: r.status + " \"" + r.body.reason + "\"", ok: r.status === 404 };
    });
    add("T20", "Retrieval", "Persistence: the order list comes from the database", "GET /api/trades after T01 to T15", "200; list holds Accepted and Rejected records, newest first", async () => {
      r = await call("GET", "/trades");
      const list = r.body.trades || [];
      const ok = r.status === 200 && list.some((t) => t.status === "Accepted") && list.some((t) => t.status === "Rejected") && list[0].submittedAt >= list[list.length - 1].submittedAt;
      return { actual: r.status + ", " + list.length + " records (" + list.filter((t) => t.status === "Accepted").length + " Accepted, " + list.filter((t) => t.status === "Rejected").length + " Rejected)", ok };
    });
    add("T21", "Retrieval", "Another user cannot read this transaction", "Confirmation number from T01, requested by a different signed-in user", "404 \"Trade not found.\" (nothing about the record is revealed)", async () => ({
      actual: "Not run here: needs a second signed-in user. Run Testing/Final-Milestone/run-matrix.js with OTHER_TOKEN to include it.", ok: null }));

    add("T22", "Error handling", "Request without a sign-in token", "POST /api/trades with no Authorization header", "401 (rejected before any processing)", async () => {
      if (guest) return { actual: "Not run in guest mode: guests have no sign-in token. Sign in to run it.", ok: null };
      try {
        r = await call("POST", "/trades", order("AAPL", "Buy", 1), true);
      } catch (e) {
        return { actual: "The browser could not read a response (the request was refused before reaching our code).", ok: null };
      }
      return { actual: String(r.status) + (r.body.reason ? " \"" + r.body.reason + "\"" : r.body.message ? " \"" + r.body.message + "\"" : ""), ok: r.status === 401 };
    });
    add("T23", "Error handling", "A normal user cannot call an admin route", "GET /api/admin/users as a non-admin", "403 \"Admins only.\"", async () => {
      if (admin) return { actual: "Not run: this account is an admin, so the route is allowed. Run it as a normal user.", ok: null };
      r = await call("GET", "/admin/users");
      return { actual: r.status + " \"" + r.body.reason + "\"", ok: r.status === 403 };
    });
    add("T24", "Error handling", "Database failure while saving", "Cannot be reproduced safely on the live system", "Nothing is saved; cash and holdings unchanged; the user is told the trade was not saved", async () => ({
      actual: "Not run live. Covered by the automated tests in aws/lambda/tests (a simulated DynamoDB failure leaves the account unchanged).", ok: null }));
    return list;
  }

  // ---------- page ----------

  const board = document.getElementById("matrixBoard");
  const summary = document.getElementById("matrixSummary");
  const go = document.getElementById("matrixRun");
  const tools = document.getElementById("matrixTools");
  let results = [];
  let confirming = false;
  let running = false;

  const label = (row) => (row.ok === null ? ["N/A", "warn"] : row.ok ? ["Pass", "ok"] : ["Fail", "bad"]);

  function rowEl(c, row) {
    const [text, kind] = row ? label(row) : ["Running…", "info"];
    return el("li", { class: "m-row " + (row ? kind : "running") },
      el("span", { class: "m-id mono" }, c.id),
      el("span", { class: "m-type" }, c.type),
      el("div", { class: "m-case" }, el("strong", null, c.name), el("small", { class: "muted" }, c.inputs)),
      el("div", { class: "m-exp" }, el("small", { class: "m-h" }, "Expected"), c.expected),
      el("div", { class: "m-act" }, el("small", { class: "m-h" }, "Actual"), row ? row.actual : "…"),
      el("span", { class: "m-res" }, pill(text, kind)));
  }

  function finish() {
    const pass = results.filter((x) => x.ok === true).length;
    const fail = results.filter((x) => x.ok === false).length;
    const na = results.length - pass - fail;
    summary.className = "matrix-summary " + (fail ? "bad" : "ok");
    summary.replaceChildren(el("strong", null, pass + " passed, " + fail + " failed, " + na + " not run"), " out of " + results.length + " cases against ", el("span", { class: "mono" }, API_BASE.startsWith("/") ? location.origin + API_BASE : API_BASE), ".");
    summary.hidden = false;
    tools.hidden = false;
    document.dispatchEvent(new CustomEvent("matrix-finished", { detail: { pass, fail, na, total: results.length } }));
  }

  const cell = (v) => String(v).replace(/\|/g, "\\|");
  function markdown() {
    return ["| Test | Type | Name | Inputs | Expected | Actual | Result |", "|---|---|---|---|---|---|---|",
      ...results.map((x) => "| " + [x.id, x.type, x.name, x.inputs, x.expected, x.actual, label(x)[0]].map(cell).join(" | ") + " |")].join("\n");
  }
  function csv() {
    const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    return "﻿" + [["Test", "Type", "Name", "Inputs", "Expected", "Actual", "Result"], ...results.map((x) => [x.id, x.type, x.name, x.inputs, x.expected, x.actual, label(x)[0]])].map((l) => l.map(q).join(",")).join("\r\n");
  }

  async function run() {
    running = true;
    go.disabled = true;
    go.textContent = "Running…";
    results = [];
    board.replaceChildren();
    summary.hidden = true;
    tools.hidden = true;
    try {
      await call("POST", "/account/reset", { confirm: "RESET" });
      const ids = {};
      for (const c of cases(ids)) {
        const live = rowEl(c, null);
        board.append(live);
        live.scrollIntoView({ block: "center", behavior: "smooth" });
        let out;
        try {
          out = await c.run();
        } catch (e) {
          out = { actual: "Error: " + e.message, ok: false };
        }
        const row = { ...c, ...out };
        results.push(row);
        live.replaceWith(rowEl(c, row));
        await pause(260); // a short beat so the room can read each row
      }
      clearCache();
      finish();
    } catch (e) {
      summary.className = "matrix-summary bad";
      summary.textContent = "The run stopped: " + e.message;
      summary.hidden = false;
    }
    running = false;
    go.disabled = false;
    go.textContent = "Run the test matrix again";
  }

  go.addEventListener("click", () => {
    if (running) return;
    if (signedInUser().isGuest || confirming) {
      confirming = false;
      return run();
    }
    confirming = true;
    go.textContent = "Yes: reset my paper account to $10,000 and run";
    setTimeout(() => { if (confirming && !running) { confirming = false; go.textContent = results.length ? "Run the test matrix again" : "Run the test matrix"; } }, 6000);
  });
  document.getElementById("matrixCopy").addEventListener("click", async (e) => {
    try { await navigator.clipboard.writeText(markdown()); e.currentTarget.textContent = "Copied"; } catch (err) { e.currentTarget.textContent = "Could not copy"; }
  });
  document.getElementById("matrixCsv").addEventListener("click", () => {
    const a = el("a", { href: URL.createObjectURL(new Blob([csv()], { type: "text/csv" })), download: "marketstreet-test-matrix-results.csv" });
    document.body.append(a);
    a.click();
    a.remove();
  });
})();
