// Public home page: an example portfolio and a price tape built from the simulated data.

(function renderLanding() {
  const sample = [["NVDA", 30], ["AAPL", 12], ["MSFT", 6]];
  document.getElementById("previewRows").replaceChildren(...sample.map(([s, q]) => {
    const st = STOCKS[s];
    const pct = (st.price - st.prev) / st.prev;
    return el("tr", null,
      el("td", null, el("strong", { class: "mono" }, s)),
      el("td", { class: "num" }, String(q)),
      el("td", { class: "num " + trendClass(pct) }, percent(pct)),
      el("td", { class: "num" }, money(cents(st.price) * q)));
  }));
  const chart = document.getElementById("previewChart");
  chart.dataset.points = JSON.stringify(STOCKS.AAPL.month.map(([d], i) => [d, 10000 + i * 58 + Math.round(Math.sin(i / 2) * 140)]));
  drawCharts();

  const items = Object.entries(STOCKS).map(([s, st]) => {
    const pct = (st.price - st.prev) / st.prev;
    return el("span", null, el("b", null, s), money(cents(st.price)) + " ", el("span", { class: trendClass(pct) }, percent(pct)));
  });
  // Two copies so the tape loops without a gap
  document.getElementById("tape").replaceChildren(...items, ...items.map((n) => n.cloneNode(true)));

  if (signedInUser()) {
    document.getElementById("heroActions").replaceChildren(el("a", { class: "btn primary", href: "dashboard.html" }, "Go to your portfolio"));
    const cta = document.getElementById("ctaButton");
    cta.textContent = "Go to your portfolio";
    cta.href = "dashboard.html";
  }
})();
