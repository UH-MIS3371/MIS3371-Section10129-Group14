// Stock page on a phone, the way trading apps lay it out: Buy and Sell stay at the bottom of the screen, and
// tapping one slides the order ticket up as a sheet (swipe it down, tap outside or press Escape to dismiss).
// The ticket itself is still trade.js's form with the same review and submit steps; this file only changes where
// it appears. Also adds the range chips (1W, 2W, 1M) beside the chart. Loaded after trade.js.

(() => {
  const sheet = document.querySelector("#stock > aside");
  if (!sheet || typeof form === "undefined" || typeof stock === "undefined" || !stock) return; // an unknown stock has no ticket

  const phone = window.matchMedia("(max-width: 900px)");
  const chart = document.getElementById("stockChart");
  const field = (id) => document.getElementById(id);
  let lastFocus = null;

  // ---------- range chips beside the chart ----------

  const full = JSON.parse(chart.dataset.points || "[]");
  const RANGES = [["1W", 5], ["2W", 10], ["1M", full.length]];
  const chips = el("div", { class: "range-chips", role: "group", "aria-label": "Chart range" }, RANGES.map(([label, days]) =>
    el("button", { type: "button", "aria-pressed": String(label === "1M"), onclick: (e) => {
      chart.dataset.points = JSON.stringify(full.slice(-Math.min(days, full.length)));
      chart.setAttribute("aria-label", symbol + " price over the last " + label + ", ending at " + money(priceCents(symbol)));
      chips.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b === e.currentTarget)));
      drawCharts();
    } }, label)));
  chart.insertAdjacentElement("afterend", chips);

  // a shorter chart on a phone, so the price, chart and Buy/Sell all fit on one screen
  if (phone.matches) {
    chart.dataset.height = "220";
    chart.style.minHeight = "220px";
    drawCharts();
  }

  // ---------- Buy and Sell bar ----------

  const bar = el("div", { class: "trade-bar" },
    el("button", { type: "button", class: "btn buy", onclick: () => open("Buy") }, "Buy"),
    el("button", { type: "button", class: "btn sell", onclick: () => open("Sell") }, "Sell"));
  document.body.append(bar);
  document.body.classList.add("has-trade-bar");

  // ---------- the sheet ----------

  const scrim = el("div", { class: "sheet-scrim", onclick: () => close() });
  const head = el("div", { class: "sheet-head" },
    el("span", { class: "sheet-grab", "aria-hidden": "true" }),
    el("button", { type: "button", class: "sheet-close", "aria-label": "Close order ticket", onclick: () => close() }));
  head.querySelector(".sheet-close").innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  sheet.prepend(head);
  document.body.append(scrim);

  // + and − beside the share count, so a thumb never needs the keyboard
  const input = field("shareQuantity");
  const stepper = el("div", { class: "qty-stepper" });
  input.replaceWith(stepper);
  const step = (delta, label) => el("button", { type: "button", class: "step", "aria-label": label, onclick: () => {
    if (reviewing) return;
    input.value = String(Math.max(1, (parseInt(input.value, 10) || 0) + delta));
    input.dispatchEvent(new Event("input", { bubbles: true }));
  } }, delta < 0 ? "−" : "+");
  stepper.append(step(-1, "One fewer share"), input, step(1, "One more share"));

  const behind = () => [document.querySelector(".site-header"), document.querySelector("#stock > div:first-child"), bar, document.querySelector(".site-footer")].filter(Boolean);

  function open(side) {
    if (!phone.matches) return;
    lastFocus = document.activeElement;
    const radio = field(side === "Sell" ? "sell" : "buy");
    if (reviewing) setReviewing(false); // each opening starts at the quantity step
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.setAttribute("aria-label", side + " " + symbol);
    sheet.tabIndex = -1;
    behind().forEach((n) => n.setAttribute("inert", ""));
    document.body.classList.add("sheet-open");
    sheet.focus({ preventScroll: true });
  }

  function close() {
    if (!document.body.classList.contains("sheet-open")) return;
    document.body.classList.remove("sheet-open");
    sheet.style.transform = "";
    behind().forEach((n) => n.removeAttribute("inert"));
    if (reviewing) setReviewing(false);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  phone.addEventListener("change", () => { if (!phone.matches) close(); });

  // drag the handle down to dismiss
  let startY = null;
  let drag = 0;
  head.addEventListener("touchstart", (e) => { startY = e.touches[0].clientY; drag = 0; sheet.style.transition = "none"; }, { passive: true });
  head.addEventListener("touchmove", (e) => {
    if (startY === null) return;
    drag = Math.max(0, e.touches[0].clientY - startY);
    sheet.style.transform = "translateY(" + drag + "px)";
  }, { passive: true });
  head.addEventListener("touchend", () => {
    if (startY === null) return;
    startY = null;
    sheet.style.transition = "";
    if (drag > 90) close();
    else sheet.style.transform = "";
  });
})();
