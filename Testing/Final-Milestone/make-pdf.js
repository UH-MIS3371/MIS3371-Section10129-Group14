"use strict";
// Makes a PDF test matrix with the installed Chrome or Edge.
//   node Testing/Final-Milestone/make-pdf.js [Team name or title]
//       test-matrix.csv (written by run-matrix.js) -> test-matrix.pdf
//   node Testing/Final-Milestone/make-pdf.js --combined
//       frontend/test-matrix-data.js (all cases: manual, live API and unit test) -> MarketStreet-Test-Matrix.pdf
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const dir = __dirname;
const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));

function print(htmlName, pdfName, html) {
  const htmlFile = path.join(dir, htmlName);
  fs.writeFileSync(htmlFile, html);
  const browsers = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  const exe = browsers.find((b) => fs.existsSync(b));
  if (!exe) { console.log("No Chrome or Edge found; open " + htmlName + " and print it to PDF."); process.exit(0); }
  execFileSync(exe, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=10000", "--print-to-pdf=" + path.join(dir, pdfName), "file:///" + htmlFile.replace(/\\/g, "/")], { stdio: "ignore" });
  fs.unlinkSync(htmlFile);
  console.log("Wrote " + path.join(dir, pdfName));
}

// ---------- Combined matrix (the submitted file) ----------
function combined() {
  const src = fs.readFileSync(path.join(dir, "../../frontend/test-matrix-data.js"), "utf8");
  const cases = new Function(src + "\nreturn MATRIX_CASES;")();
  const isPass = (c) => c.result.startsWith("Pass");
  const tally = (list) => ({ pass: list.filter(isPass).length, fail: list.filter((c) => c.result === "Fail").length, notRun: list.filter((c) => c.result === "Not run").length, total: list.length });
  const groups = [
    ["All cases", cases],
    ["Manual, in the browser", cases.filter((c) => c.source.startsWith("Manual"))],
    ["Automated, live API", cases.filter((c) => c.source === "Automated (live API)")],
    ["Automated, unit test", cases.filter((c) => c.source === "Automated (unit test)")]
  ].filter(([, list]) => list.length);
  const all = tally(cases);
  const live = cases.filter((c) => c.source !== "Automated (unit test)").length;
  const card = ([title, list]) => { const t = tally(list); return `<div class="tm-card"><h2>${esc(title)}</h2><div class="tm-big">${t.pass} / ${t.total}</div><p>${t.pass} passed, ${t.fail} failed, ${t.notRun} not run</p></div>`; };
  const resultCell = (c) => {
    const [main, ...rest] = c.result.split(" (");
    const cls = main === "Not run" ? "Not" : main;
    const mark = main === "Pass" ? "✓ " : main === "Fail" ? "✕ " : "– ";
    return `<span class="tm-res ${esc(cls)}">${mark}${esc(main)}</span>` + (rest.length ? `<span class="tm-how-run">(${esc(rest.join(" ("))}</span>` : "");
  };
  const row = (c) => `<tr><th scope="row" class="tm-id">${esc(c.id)}</th>
<td class="tm-what"><span class="tm-name">${esc(c.name)}</span><span class="tm-meta">${esc([c.source, c.type, c.feature, c.date, c.rules].filter(Boolean).join(" · "))}</span>${c.note ? `<span class="tm-note">${esc(c.note)}</span>` : ""}</td>
<td class="tm-in">${esc([c.steps, c.input].filter(Boolean).join("\n\n"))}</td><td>${esc(c.expected)}</td><td>${esc(c.actual)}</td><td>${resultCell(c)}</td></tr>`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Test matrix – MarketStreet</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Public+Sans:wght@400;500;600;700&display=swap">
<style>
@page { size: Letter landscape; margin: 10mm; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; }
body { color: #111; font-family: "Public Sans", system-ui, sans-serif; --text: #111; --muted: #444; --control: #bbb; --surface: #fff; --raised: #eee; --buy: #0a6b3d; --sell: #b00020; --warning: #8a6100; --accent: #1a4fa0; --radius: 6px; }
.tm { padding: 0 4px; }
.tm h1 { margin: 6px 0 6px; font-size: 32px; letter-spacing: -0.01em; }
.tm-lead { margin: 0 0 16px; max-width: 86ch; font-size: 16px; line-height: 1.5; color: var(--muted); }
.tm-sum { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.tm-card { padding: 14px 16px; border: 1px solid var(--control); border-radius: var(--radius); background: var(--surface); }
.tm-card h2 { margin: 0 0 6px; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
.tm-big { font-size: 28px; font-weight: 600; font-family: "IBM Plex Mono", monospace; font-variant-numeric: tabular-nums; }
.tm-card p { margin: 4px 0 0; font-size: 14px; color: var(--muted); }
.tm-how { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px 24px; margin: 18px 0; font-size: 14px; line-height: 1.5; }
.tm-how div { display: grid; gap: 2px; align-content: start; }
.tm-how span { color: var(--muted); }
.tm-count { margin: 12px 0 6px; font-size: 14px; color: var(--muted); }
.tm-wrap { border: 1px solid var(--control); border-radius: var(--radius); background: var(--surface); }
.tm-table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 14px; line-height: 1.45; }
.tm-table th, .tm-table td { padding: 10px 10px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--control); overflow-wrap: anywhere; }
.tm-table thead th { font-size: 12px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); background: var(--raised); }
.tm-table tbody tr:last-child td, .tm-table tbody tr:last-child th { border-bottom: 0; }
.tm-table tr { break-inside: avoid; }
.tm-id { font-family: "IBM Plex Mono", monospace; font-weight: 600; white-space: nowrap; }
.tm-name { font-weight: 600; }
.tm-meta { display: block; margin-top: 3px; font-size: 12.5px; font-weight: 400; color: var(--muted); }
.tm-in { white-space: pre-line; color: var(--muted); font-size: 13px; }
.tm-note { display: block; margin-top: 6px; font-size: 12.5px; color: var(--muted); }
.tm-res { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 13px; font-weight: 600; border: 1px solid; white-space: nowrap; }
.tm-res.Pass { color: var(--buy); border-color: var(--buy); }
.tm-res.Fail { color: var(--sell); border-color: var(--sell); }
.tm-res.Not { color: var(--warning); border-color: var(--warning); }
.tm-how-run { display: block; margin-top: 6px; font-size: 12px; color: var(--muted); }
.tm-foot { margin: 16px 0 0; font-size: 13.5px; line-height: 1.5; color: var(--muted); }
.tm code { font-family: "IBM Plex Mono", monospace; font-size: 0.92em; }
</style></head><body><main class="tm">
<h1>Test matrix</h1>
<p class="tm-lead">Milestone 4, Group 14. ${all.total} cases covering valid orders, invalid input, boundaries, the business rules BR-1 to BR-9, retrieval and error handling. ${live} cases ran on the live site and its database. U-01 checks BR-6 (a price quoted more than 15 minutes ago) with an automated unit test, because the live prices are always quoted at the moment of the order.</p>
<div class="tm-sum">${groups.map(card).join("")}</div>
<section class="tm-how">
<div><b>Manual (M-01 to M-11)</b><span>A teammate ran these by hand in the browser on 2026-11-21: sign-up, email verification, buying, selling and View Status.</span></div>
<div><b>Automated (T01 to T24)</b><span>Run from the Grader check page (/grader.html) on 2026-11-22 while signed in. Each case sends the same JSON the order form sends to the live API and DynamoDB. The run resets the account to $10,000.00 cash and no holdings first, then runs the cases in order.</span></div>
<div><b>Unit test (U-01)</b><span>Part of <code>npm test</code> in <code>aws/lambda</code> (80 tests, all passed on 2026-11-27). Its Result names the test.</span></div>
<div><b>Result</b><span>Pass means the actual result matched the expected result. An order that is correctly rejected is a Pass.</span></div>
</section>
<p class="tm-count">${all.total} cases: ${all.pass} passed, ${all.fail} failed, ${all.notRun} not run</p>
<div class="tm-wrap"><table class="tm-table"><colgroup><col style="width:6%"><col style="width:19%"><col style="width:29%"><col style="width:16%"><col style="width:20%"><col style="width:10%"></colgroup><thead><tr>${["Test", "What", "Entered", "Expected", "Actual", "Result"].map((t) => `<th scope="col">${t}</th>`).join("")}</tr></thead>
<tbody>${cases.map(row).join("\n")}</tbody></table></div>
<p class="tm-foot">Not run: T21 needs a second signed-in user (run <code>run-matrix.js</code> with <code>OTHER_TOKEN</code>). T23 needs a non-admin account (run the matrix signed in as a normal user). T24 simulates a database failure and is covered by a unit test in <code>aws/lambda/tests/platform.test.js</code>. Source files are in <code>Testing/Final-Milestone</code> and <code>frontend/test-matrix-data.js</code> in the repository.</p>
</main></body></html>`;
  print("MarketStreet-Test-Matrix.html", "MarketStreet-Test-Matrix.pdf", html);
}

// ---------- One live run (test-matrix.csv from run-matrix.js) ----------
function single() {
  const csv = fs.readFileSync(path.join(dir, "test-matrix.csv"), "utf8").replace(/^\ufeff/, "");
  const records = [];
  for (let i = 0, row = [], cell = "", quoted = false; i <= csv.length; i++) {
    const c = csv[i];
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === "," || c === "\n" || c === "\r" || c === undefined) {
      if (c === "\r" && csv[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (c !== ",") { if (row.length > 1) records.push(row); row = []; }
    } else cell += c;
  }
  const [head, ...body] = records;
  const pass = body.filter((r) => r[6] === "Pass").length;
  const fail = body.filter((r) => r[6] === "Fail").length;
  const title = process.argv[2] || "MarketStreet";
  const html = `<!doctype html><meta charset="utf-8"><title>${esc(title)} test matrix</title>
<style>@page{size:landscape;margin:12mm}body{font:11px/1.35 Arial,sans-serif;color:#111}h1{font-size:18px;margin:0 0 4px}p{margin:0 0 10px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:4px 6px;vertical-align:top;text-align:left;white-space:pre-line}th{background:#eee}
tr{break-inside:avoid}.Pass{color:#0a6b3d;font-weight:700}.Fail{color:#b00020;font-weight:700}</style>
<h1>${esc(title)} test matrix: Milestone 4</h1>
<p>${body.length} test cases: ${pass} passed, ${fail} failed, ${body.length - pass - fail} not run (each explains why). Generated ${new Date().toISOString().slice(0, 10)} by run-matrix.js. Every case sends the same JSON the order form sends.</p>
<table><thead><tr>${head.map((h) => "<th>" + esc(h) + "</th>").join("")}</tr></thead><tbody>
${body.map((r) => "<tr>" + r.map((v, i) => "<td" + (i === 6 ? ' class="' + esc(v) + '"' : "") + ">" + esc(v) + "</td>").join("") + "</tr>").join("\n")}
</tbody></table>`;
  print("test-matrix.html", "test-matrix.pdf", html);
}

if (process.argv[2] === "--combined") combined(); else single();
