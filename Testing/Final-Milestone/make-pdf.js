"use strict";
// Turns test-matrix.csv (written by run-matrix.js) into test-matrix.pdf with the installed Chrome or Edge.
//   node Testing/Final-Milestone/make-pdf.js [Team name or title]
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const dir = __dirname;
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
const esc = (s) => String(s).replace(/[&<>]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[m]));
const pass = body.filter((r) => r[6] === "Pass").length;
const fail = body.filter((r) => r[6] === "Fail").length;
const title = process.argv[2] || "MarketStreet";
const html = `<!doctype html><meta charset="utf-8"><title>${esc(title)} test matrix</title>
<style>@page{size:landscape;margin:12mm}body{font:11px/1.35 Arial,sans-serif;color:#111}h1{font-size:18px;margin:0 0 4px}p{margin:0 0 10px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #bbb;padding:4px 6px;vertical-align:top;text-align:left}th{background:#eee}
tr{break-inside:avoid}.Pass{color:#0a6b3d;font-weight:700}.Fail{color:#b00020;font-weight:700}</style>
<h1>${esc(title)} test matrix: Milestone 4</h1>
<p>${body.length} test cases: ${pass} passed, ${fail} failed, ${body.length - pass - fail} explained. Generated ${new Date().toISOString().slice(0, 10)} from run-matrix.js. Every case sends the same JSON the order form sends.</p>
<table><thead><tr>${head.map((h) => "<th>" + esc(h) + "</th>").join("")}</tr></thead><tbody>
${body.map((r) => "<tr>" + r.map((v, i) => "<td" + (i === 6 ? ' class="' + esc(v) + '"' : "") + ">" + esc(v) + "</td>").join("") + "</tr>").join("\n")}
</tbody></table>`;
const htmlFile = path.join(dir, "test-matrix.html");
fs.writeFileSync(htmlFile, html);
const browsers = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
const exe = browsers.find((b) => fs.existsSync(b));
if (!exe) { console.log("No Chrome or Edge found; open test-matrix.html and print it to PDF."); process.exit(0); }
execFileSync(exe, ["--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--print-to-pdf=" + path.join(dir, "test-matrix.pdf"), "file:///" + htmlFile.replace(/\\/g, "/")], { stdio: "ignore" });
fs.unlinkSync(htmlFile);
console.log("Wrote " + path.join(dir, "test-matrix.pdf"));
