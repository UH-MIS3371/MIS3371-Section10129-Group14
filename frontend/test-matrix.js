// Renders the combined test matrix from test-matrix-data.js. No API calls.
const $ = (id) => document.getElementById(id);
const cases = MATRIX_CASES;
const state = { filter: "All", q: "" };

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) (k === "class" ? (e.className = v) : e.setAttribute(k, v));
  for (const k of kids.flat()) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
const count = (list, r) => list.filter((c) => c.result === r).length;
const manual = cases.filter((c) => c.source.startsWith("Manual"));
const auto = cases.filter((c) => c.source.startsWith("Auto"));

function card(title, list) {
  return h("div", { class: "tm-card" }, h("h2", null, title),
    h("div", { class: "tm-big" }, count(list, "Pass") + " / " + list.length),
    h("p", null, count(list, "Pass") + " passed, " + count(list, "Fail") + " failed, " + count(list, "Not run") + " not run"));
}
$("sum").replaceChildren(card("All cases", cases), card("Manual, in the browser", manual), card("Automated, live API", auto));

const FILTERS = ["All", "Valid", "Invalid", "Boundary", "Business rule", "Retrieval", "Error handling", "Sign-in", "Not run"];
function match(c, f) {
  if (f === "All") return true;
  if (f === "Not run") return c.result === "Not run";
  if (f === "Sign-in") return /Create Account|Email Verification/.test(c.feature);
  if (f === "Retrieval") return /^Retrieval/.test(c.type) || c.feature === "Activity";
  if (f === "Valid") return /^Valid/.test(c.type);
  if (f === "Invalid") return /^Invalid/.test(c.type);
  if (f === "Boundary") return /^Boundary/.test(c.type);
  return c.type === f;
}

function paintFilters() {
  $("filters").replaceChildren(...FILTERS.map((f) => {
    const b = h("button", { type: "button", class: "tm-chip", "aria-pressed": String(state.filter === f) }, f);
    b.addEventListener("click", () => { state.filter = f; paintFilters(); paint(); });
    return b;
  }));
}

function row(c) {
  const rs = c.result === "Not run" ? "Not" : c.result;
  return h("tr", null,
    h("th", { scope: "row", class: "tm-id", "data-l": "Test" }, c.id),
    h("td", { "data-l": "What", class: "tm-what" }, h("span", { class: "tm-name" }, c.name),
      h("span", { class: "tm-meta" }, c.source + " · " + c.type + " · " + c.feature + " · " + c.date + (c.rules ? " · " + c.rules : "")),
      c.note ? h("span", { class: "tm-note" }, c.note) : null),
    h("td", { "data-l": "Entered", class: "tm-in" }, [c.steps, c.input].filter(Boolean).join("\n")),
    h("td", { "data-l": "Expected" }, c.expected),
    h("td", { "data-l": "Actual" }, c.actual),
    h("td", { "data-l": "Result" }, h("span", { class: "tm-res " + rs }, (c.result === "Pass" ? "✓ " : c.result === "Fail" ? "✕ " : "– ") + c.result)));
}

function paint() {
  const q = state.q.trim().toLowerCase();
  const list = cases.filter((c) => match(c, state.filter) && (!q || JSON.stringify(c).toLowerCase().includes(q)));
  $("count").textContent = "Showing " + list.length + " of " + cases.length + " cases";
  const head = h("thead", null, h("tr", null, ...["Test", "What", "Entered", "Expected", "Actual", "Result"].map((t) => h("th", { scope: "col" }, t))));
  $("tbl").replaceChildren(head, h("tbody", null, ...(list.length ? list.map(row) : [h("tr", null, h("td", { colspan: "6", class: "tm-empty" }, "No cases match."))])));
}

$("q").addEventListener("input", (e) => { state.q = e.target.value; paint(); });
paintFilters();
paint();
