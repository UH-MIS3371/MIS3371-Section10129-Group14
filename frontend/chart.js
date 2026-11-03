// MarketStreet — simple SVG charts for the screen designs.
// <div class="chart" data-points='[["Sep 11", 176.2], ...]'> draws a price chart with a hover crosshair.
// Everything is inside one function so these names never clash with app.js.

(() => {

  const SVG_NS = "http://www.w3.org/2000/svg";

  function svgEl(name, attrs) {
    const el = document.createElementNS(SVG_NS, name);
    for (const key in attrs) el.setAttribute(key, attrs[key]);
    return el;
  }

  function money(n, decimals) {
    return n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  // A "nice" step for about 3–4 grid lines (1, 2, 2.5, or 5 times a power of ten)
  function niceStep(range) {
    const raw = range / 3;
    const power = Math.pow(10, Math.floor(Math.log10(raw)));
    const steps = [1, 2, 2.5, 5, 10];
    return power * steps.find((s) => s * power >= raw);
  }

  function drawChart(box) {
    if (!box.dataset.points) return;
    const points = JSON.parse(box.dataset.points);
    const values = points.map((p) => p[1]);
    const width = box.clientWidth;
    const height = Number(box.dataset.height || 260);
    const pad = { top: 12, right: 60, bottom: 28, left: 4 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const step = niceStep(Math.max(...values) - Math.min(...values));
    const min = Math.floor(Math.min(...values) / step) * step;
    const max = Math.ceil(Math.max(...values) / step) * step;
    const x = (i) => pad.left + (i / (points.length - 1)) * plotW;
    const y = (v) => pad.top + (1 - (v - min) / (max - min)) * plotH;

    box.innerHTML = "";
    const svg = svgEl("svg", { width, height, viewBox: `0 0 ${width} ${height}`, "aria-hidden": "true" });

    // Grid lines and price labels on the right
    for (let v = min; v <= max + step / 2; v += step) {
      svg.append(svgEl("line", { x1: pad.left, x2: pad.left + plotW, y1: y(v), y2: y(v), class: "grid" }));
      const label = svgEl("text", { x: width - 4, y: y(v) + 4, "text-anchor": "end", class: "axis" });
      label.textContent = money(v, 0);
      svg.append(label);
    }

    // Date labels: first, middle, last
    [0, Math.floor((points.length - 1) / 2), points.length - 1].forEach((i, n) => {
      const anchor = ["start", "middle", "end"][n];
      const label = svgEl("text", { x: x(i), y: height - 8, "text-anchor": anchor, class: "axis" });
      label.textContent = points[i][0];
      svg.append(label);
    });

    // Area and line
    const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
    const base = pad.top + plotH;
    svg.append(svgEl("path", { d: `${line}L${x(points.length - 1)},${base}L${x(0)},${base}Z`, class: "area" }));
    svg.append(svgEl("path", { d: line, class: "line" }));

    // Hover layer: crosshair, dot, and tooltip
    const cross = svgEl("line", { y1: pad.top, y2: base, class: "crosshair", visibility: "hidden" });
    const dot = svgEl("circle", { r: 5, class: "dot", visibility: "hidden" });
    const hit = svgEl("rect", { x: pad.left, y: 0, width: plotW, height, fill: "transparent" });
    svg.append(cross, dot, hit);

    const tip = document.createElement("div");
    tip.className = "tooltip";
    tip.hidden = true;
    box.append(svg, tip);

    hit.addEventListener("pointermove", (e) => {
      const rect = svg.getBoundingClientRect();
      const i = Math.round(((e.clientX - rect.left - pad.left) / plotW) * (points.length - 1));
      const p = points[Math.max(0, Math.min(points.length - 1, i))];
      const px = x(points.indexOf(p));
      cross.setAttribute("x1", px);
      cross.setAttribute("x2", px);
      dot.setAttribute("cx", px);
      dot.setAttribute("cy", y(p[1]));
      cross.setAttribute("visibility", "visible");
      dot.setAttribute("visibility", "visible");
      tip.innerHTML = `<strong>${money(p[1], 2)}</strong><span>${p[0]}</span>`;
      tip.hidden = false;
      tip.style.left = Math.min(Math.max(px - tip.offsetWidth / 2, 0), width - tip.offsetWidth) + "px";
    });

    hit.addEventListener("pointerleave", () => {
      cross.setAttribute("visibility", "hidden");
      dot.setAttribute("visibility", "hidden");
      tip.hidden = true;
    });
  }

  function drawAll() {
    document.querySelectorAll(".chart").forEach(drawChart);
  }

  drawAll();
  window.addEventListener("resize", drawAll);
})();
