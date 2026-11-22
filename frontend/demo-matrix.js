// Test matrix on the demo page: sends the Milestone 4 test cases to the API (the same cases and expected results as
// Testing/Final-Milestone/run-matrix.js, which writes the files) and shows expected next to actual in a compact table that fills in place.
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
  // The table exists from the start with every case "Pending" and each row is updated in place, so nothing moves
  // while the run goes on and the page never scrolls by itself. Presentation only: the cases above are unchanged.

  const board = document.getElementById("matrixBoard");
  const summary = document.getElementById("matrixSummary");
  const go = document.getElementById("matrixRun");
  const tools = document.getElementById("matrixTools");
  let results = [];
  let confirming = false;
  let running = false;
  let view = {}; // id -> { tr, detail, ... } for the table on screen

  const label = (row) => (row.ok === null ? ["N/A", "warn"] : row.ok ? ["Pass", "ok"] : ["Fail", "bad"]);
  const TYPES = ["Valid", "Invalid", "Boundary", "Business rule", "Retrieval", "Error handling"];

  // ----- short forms for the at-a-glance table (the full strings stay in the details row, Copy and CSV) -----
  const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
  const shortName = (name) => name.replace(/\s*\([^)]*\)\s*$/, "");
  const SHORT_EXP = {
    T15: "200 · duplicate returned · charged $412.30",
    T16: "200 · status Accepted",
    T17: "200 · status Rejected · category Rule",
    T20: "200 · Accepted and Rejected records, newest first",
    T21: "404 · Trade not found.",
    T22: "401 · refused before any processing",
    T24: "Nothing saved; account unchanged"
  };
  function shortOf(s, withCash, isExp) {
    const m = String(s).match(/^(\d{3})\s*(.*)$/);
    if (!m) return clip(String(s).split(";")[0], 70);
    const q = m[2].match(/"([^"]*)"/);
    const word = m[2].match(/^([A-Z]{3,})\b/);
    const cash = String(s).match(isExp ? /cash (?:becomes|returns to) (\$[\d,.]+)/ : /cash (\$[\d,.]+)/);
    return [m[1], q ? q[1] : word ? word[1] : "", withCash && cash ? "cash " + cash[1] : ""].filter(Boolean).join(" · ");
  }
  const shortExpected = (c) => SHORT_EXP[c.id] || shortOf(c.expected, true, true);
  function shortActual(c, row) {
    if (row.ok === null) return "Not run";
    const a = row.actual;
    let m;
    if (c.id === "T15") {
      m = a.match(/duplicate=(\w+).*cash (\$[\d,.]+)/);
      const cents = m ? Math.round(parseFloat(m[2].replace(/[$,]/g, "")) * 100) : NaN;
      return m ? a.slice(0, 3) + " · " + (m[1] === "true" ? "duplicate returned" : "no duplicate flag") + " · charged " + money(1000000 - cents) : clip(a, 70);
    }
    if (c.id === "T16" && (m = a.match(/status (\w+)/))) return a.slice(0, 3) + " · status " + m[1];
    if (c.id === "T17" && (m = a.match(/status (\w+).*category (\w+)/))) return a.slice(0, 3) + " · status " + m[1] + " · category " + m[2];
    if (c.id === "T20" && (m = a.match(/^(\d{3}), (.*)$/))) return m[1] + " · " + m[2];
    return shortOf(a, /cash/.test(shortExpected(c)), false);
  }

  // Mark the words that differ between two strings (used only when a case fails).
  function diffNodes(text, other) {
    const norm = (w) => w.toLowerCase().replace(/[^a-z0-9$.]/g, "");
    const seen = new Set(String(other).split(/\s+/).map(norm));
    return String(text).split(/(;\s*)/).flatMap((seg) => (seg.trim() === ";" || seg.trim() === "" || String(other).includes(seg.trim())
      ? [seg]
      : seg.split(/(\s+)/).map((w) => (/^\s*$/.test(w) || seen.has(norm(w)) ? w : el("mark", { class: "m-diff" }, w)))));
  }

  const MARK = { pass: ["✓", "Pass"], fail: ["✕", "Fail"], na: ["–", "Not run"], pending: ["", "Pending"], running: ["", "Running"] };
  function badge(kind) {
    const [icon, text] = MARK[kind];
    return el("span", { class: "m-badge " + kind }, icon ? el("span", { class: "m-ico", "aria-hidden": "true" }, icon) : null, text);
  }
  const kindOf = (row) => (row.ok === null ? "na" : row.ok ? "pass" : "fail");

  function buildTable(list) {
    view = {};
    const table = el("table", { class: "m-table" });
    table.append(el("caption", { class: "visually-hidden" }, "Test matrix results, one row per case. Select a row to see its full inputs, expected result and actual result."),
      el("thead", null, el("tr", null, ["ID", "Case", "Expected", "Actual", "Result"].map((h) => el("th", { scope: "col", class: "m-c-" + h.toLowerCase() }, h)))));
    const types = TYPES.filter((t) => list.some((c) => c.type === t));
    for (const type of types) {
      const group = list.filter((c) => c.type === type);
      const tb = el("tbody", { class: "m-group" });
      const count = el("span", { class: "m-count" }, group.length + (group.length === 1 ? " case" : " cases"));
      tb.append(el("tr", { class: "m-grouprow" }, el("th", { scope: "rowgroup", colspan: "5" }, type, count)));
      for (const c of group) {
        const dId = "m-d-" + c.id;
        const toggle = el("button", { type: "button", class: "m-toggle", "aria-expanded": "false", "aria-controls": dId },
          el("span", { class: "m-name" }, shortName(c.name)), el("span", { class: "m-chev", "aria-hidden": "true" }, "▸"));
        const exp = el("td", { class: "m-exp" }, shortExpected(c));
        const act = el("td", { class: "m-act" }, "…");
        const res = el("td", { class: "m-res" }, badge("pending"));
        const tr = el("tr", { class: "m-row pending", "data-id": c.id }, el("td", { class: "m-id mono" }, c.id), el("td", { class: "m-case" }, toggle), exp, act, res);
        const body = el("div", { class: "m-full" });
        const detail = el("tr", { class: "m-detail", id: dId, hidden: true }, el("td", { colspan: "5" }, body));
        tr.addEventListener("click", () => {
          const open = toggle.getAttribute("aria-expanded") !== "true";
          toggle.setAttribute("aria-expanded", String(open));
          detail.hidden = !open;
          tr.classList.toggle("open", open);
        });
        tb.append(tr, detail);
        view[c.id] = { c, tr, exp, act, res, body };
        fillDetail(view[c.id], null);
      }
      table.append(tb);
    }
    board.replaceChildren(el("div", { class: "m-wrap" }, table));
  }

  function fillDetail(v, row) {
    const c = v.c;
    const failed = row && row.ok === false;
    const part = (h, content) => el("div", { class: "m-part" }, el("div", { class: "m-h" }, h), el("p", { class: "m-text" }, content));
    v.body.replaceChildren(
      el("div", { class: "m-fullname" }, c.id + " · " + c.name),
      part("Inputs", c.inputs),
      el("div", { class: "m-pair" },
        part("Expected (full)", failed ? diffNodes(c.expected, row.actual) : c.expected),
        part(row && row.ok === null ? "What happened" : "Actual (full)", row ? (failed ? diffNodes(row.actual, c.expected) : row.actual) : "Not run yet.")));
  }

  function setRow(c, row) {
    const v = view[c.id];
    const kind = kindOf(row);
    v.tr.className = "m-row " + kind + (v.tr.classList.contains("open") ? " open" : "");
    v.act.replaceChildren(el("span", { class: "m-short" }, shortActual(c, row)),
      kind === "pass" ? el("span", { class: "m-match ok" }, el("span", { "aria-hidden": "true" }, "✓ "), "Match")
        : kind === "fail" ? el("span", { class: "m-match bad" }, el("span", { "aria-hidden": "true" }, "✕ "), "Differs") : null);
    v.res.replaceChildren(badge(kind));
    fillDetail(v, row);
  }

  // ----- summary -----
  const reasonOf = (x) => {
    if (x.id === "T21") return "Needs a second signed-in user. The command-line runner can include it.";
    if (x.id === "T24") return "A database failure cannot be triggered safely on the live system. The automated tests cover it.";
    if (/guest/i.test(x.actual)) return "Guests have no sign-in token to leave out. Sign in to run it.";
    if (/admin/i.test(x.actual)) return "This account is an admin, so the route is allowed. Run it as a normal user.";
    if (/browser could not/i.test(x.actual)) return "The browser hid the response; the request was refused before reaching our code.";
    return x.actual;
  };

  function showProgress(done, total, current) {
    const pct = Math.round((done / total) * 100);
    summary.className = "matrix-summary running";
    summary.replaceChildren(
      el("div", { class: "ms-top" }, el("div", { class: "ms-big" }, "Running ", el("span", { class: "mono" }, Math.min(done + 1, total) + " of " + total)),
        el("div", { class: "ms-sub" }, current ? current.id + " · " + shortName(current.name) : "Resetting the paper account to $10,000.00")),
      el("div", { class: "ms-bar", role: "progressbar", "aria-label": "Test run progress", "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": String(done) },
        el("span", { class: "ms-seg run", style: "width:" + pct + "%" })));
    summary.hidden = false;
  }

  function finish() {
    const pass = results.filter((x) => x.ok === true).length;
    const fail = results.filter((x) => x.ok === false).length;
    const na = results.length - pass - fail;
    const total = results.length;
    const failed = results.filter((x) => x.ok === false);
    const skipped = results.filter((x) => x.ok === null);
    const where = API_BASE.startsWith("/") ? location.origin + API_BASE : API_BASE;
    const verdict = fail
      ? fail + (fail === 1 ? " case" : " cases") + " did not match the expected result. " + (fail === 1 ? "It is" : "They are") + " listed first below."
      : "Every case that could run here matched its expected result." + (na ? " " + na + " could not run on this system, each explained below." : "");
    const seg = (n, kind, name) => (n ? el("span", { class: "ms-seg " + kind, style: "flex:" + n + " 1 0", title: n + " " + name }) : null);
    const legend = (n, kind, icon, name) => el("li", { class: "ms-leg " + kind }, el("span", { class: "m-ico", "aria-hidden": "true" }, icon), el("b", null, n), " " + name);

    summary.className = "matrix-summary done " + (fail ? "bad" : "ok");
    summary.replaceChildren(...[
      el("div", { class: "ms-top" },
        el("div", { class: "ms-big" }, el("span", { class: "mono" }, pass + " of " + total), " passed"),
        el("p", { class: "ms-verdict" }, verdict)),
      el("div", { class: "ms-bar", role: "img", "aria-label": pass + " passed, " + fail + " failed, " + na + " not run, out of " + total + " cases" },
        seg(pass, "pass", "passed"), seg(fail, "fail", "failed"), seg(na, "na", "not run")),
      el("ul", { class: "ms-legend" }, legend(pass, "pass", "✓", "passed"), legend(fail, "fail", "✕", "failed"), legend(na, "na", "–", "not run")),
      failed.length ? el("section", { class: "ms-block attention", "aria-label": "Needs attention" },
        el("h3", null, "Needs attention (" + failed.length + ")"),
        el("ul", null, failed.map((x) => el("li", null, el("div", { class: "ms-title" }, el("span", { class: "mono" }, x.id), " · " + x.name),
          el("div", { class: "ms-cmp" }, el("span", { class: "m-h" }, "Expected"), el("span", null, diffNodes(x.expected, x.actual)),
            el("span", { class: "m-h" }, "Actual"), el("span", null, diffNodes(x.actual, x.expected))))))) : null,
      skipped.length ? el("section", { class: "ms-block notrun", "aria-label": "Not run" },
        el("h3", null, "Not run (" + skipped.length + ")"),
        el("ul", null, skipped.map((x) => el("li", null, el("span", { class: "mono" }, x.id), el("span", null, reasonOf(x)))))) : null,
      el("p", { class: "ms-where" }, "Run against ", el("span", { class: "mono" }, where), ".")].filter(Boolean));
    summary.hidden = false;
    tools.hidden = false;
    document.dispatchEvent(new CustomEvent("matrix-finished", { detail: { pass, fail, na, total } }));
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
    tools.hidden = true;
    board.setAttribute("aria-busy", "true"); // the screen reader hears the final summary, not 24 row updates
    const ids = {};
    const list = cases(ids);
    buildTable(list);
    showProgress(0, list.length, null);
    try {
      await call("POST", "/account/reset", { confirm: "RESET" });
      for (const c of list) {
        const v = view[c.id];
        v.tr.className = "m-row running";
        v.res.replaceChildren(badge("running"));
        showProgress(results.length, list.length, c);
        let out;
        try {
          out = await c.run();
        } catch (e) {
          out = { actual: "Error: " + e.message, ok: false };
        }
        const row = { ...c, ...out };
        results.push(row);
        setRow(c, row);
      }
      clearCache();
      finish();
    } catch (e) {
      summary.className = "matrix-summary bad";
      summary.textContent = "The run stopped: " + e.message;
      summary.hidden = false;
    }
    board.removeAttribute("aria-busy");
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

  buildTable(cases({})); // the plan, before anything runs: every case "Pending"
})();
