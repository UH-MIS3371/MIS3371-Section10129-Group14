// MarketStreet Scenarios: candlestick or line chart with moving averages, volume and a hover readout (SVG).
// drawMarketChart(box, readout, { dates, bars, from, type, mas, mark, trades, news, position }) draws
// bars[from..] where each bar is [open, high, low, close, volume].

(() => {
  const NS = "http://www.w3.org/2000/svg";
  const MA_CLASS = { 20: "ma20", 50: "ma50" };

  function svg(name, attrs, text) {
    const node = document.createElementNS(NS, name);
    for (const key in attrs) node.setAttribute(key, attrs[key]);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function niceStep(range) {
    const raw = range / 4;
    const power = Math.pow(10, Math.floor(Math.log10(raw)));
    return power * [1, 2, 2.5, 5, 10].find((s) => s * power >= raw);
  }

  function volume(v) {
    if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
    if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
    return v < 1e3 ? String(v) : Math.round(v / 1e3) + "K";
  }

  function shortDate(iso) {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  // Average close of the last n days, or null until there are n days of history
  function movingAverage(bars, n) {
    let sum = 0;
    return bars.map((bar, i) => {
      sum += bar[3] - (i >= n ? bars[i - n][3] : 0);
      return i >= n - 1 ? sum / n : null;
    });
  }

  function showReadout(readout, date, bar, prevClose) {
    const [open, high, low, close, vol] = bar;
    const change = close - prevClose;
    readout.replaceChildren(
      shortDate(date) + "   O " + open.toFixed(2) + "   H " + high.toFixed(2) + "   L " + low.toFixed(2) + "   C " + close.toFixed(2) + "   ",
      Object.assign(document.createElement("span"), {
        className: change >= 0 ? "up" : "down",
        textContent: (change >= 0 ? "▲ +" : "▼ −") + Math.abs((change / prevClose) * 100).toFixed(2) + "%"
      }),
      vol ? "   Vol " + volume(vol) : "");
  }

  window.drawMarketChart = function (box, readout, view) {
    const { dates, bars, from, type, mas, mark, trades, news, position } = view;
    const shown = bars.slice(from);
    const averages = mas.map((n) => [n, movingAverage(bars, n).slice(from)]);
    const width = box.clientWidth;
    const height = box.clientHeight || 360;
    const pad = { top: 10, right: 64, bottom: 24, left: 4 };
    const volH = Math.round(height * 0.16);
    const plotW = width - pad.left - pad.right;
    const priceBottom = height - pad.bottom - volH - 12;
    const slot = plotW / shown.length;

    const values = shown.flatMap((b) => (type === "line" ? [b[3]] : [b[1], b[2]]));
    averages.forEach(([, line]) => line.forEach((v) => v !== null && values.push(v)));
    if (position) values.push(position.avg);
    const step = niceStep(Math.max(...values) - Math.min(...values) || 1);
    const min = Math.floor(Math.min(...values) / step) * step;
    const max = Math.ceil(Math.max(...values) / step) * step;
    const maxVol = Math.max(...shown.map((b) => b[4])) || 1;
    const x = (i) => pad.left + slot * (i + 0.5);
    const y = (v) => pad.top + (1 - (v - min) / (max - min)) * (priceBottom - pad.top);
    const decimals = step < 1 ? 2 : 0;
    const last = shown.at(-1);
    const lastDir = last[3] >= (bars[from + shown.length - 2] || last)[3] ? "up" : "down";

    const root = svg("svg", { width, height, viewBox: `0 0 ${width} ${height}`, "aria-hidden": "true" });

    // Price grid; a label that would sit under the last-price tag is left out
    for (let v = min; v <= max + step / 2; v += step) {
      root.append(svg("line", { x1: pad.left, x2: pad.left + plotW, y1: y(v), y2: y(v), class: "grid" }));
      if (Math.abs(y(v) - y(last[3])) > 14) {
        root.append(svg("text", { x: width - 4, y: y(v) + 4, "text-anchor": "end", class: "axis" }, "$" + v.toFixed(decimals)));
      }
    }

    const labels = Math.min(5, shown.length, Math.floor(plotW / 90) + 1);
    for (let n = 0; n < labels; n++) {
      const i = Math.round((n * (shown.length - 1)) / Math.max(labels - 1, 1));
      const anchor = n === 0 ? "start" : n === labels - 1 ? "end" : "middle";
      const at = n === 0 ? pad.left : n === labels - 1 ? pad.left + plotW : x(i);
      root.append(svg("text", { x: at, y: height - 6, "text-anchor": anchor, class: "axis" }, shortDate(dates[from + i])));
    }

    shown.forEach(([open, high, low, close, vol], i) => {
      const dir = close >= open ? "up" : "down";
      const barW = Math.max(1, slot * 0.65);
      const vh = (vol / maxVol) * volH;
      root.append(svg("rect", { x: x(i) - barW / 2, y: height - pad.bottom - vh, width: barW, height: vh, class: "vol " + dir }));
      if (type === "line") return;
      root.append(svg("line", { x1: x(i), x2: x(i), y1: y(high), y2: y(low), class: "wick " + dir }));
      const top = y(Math.max(open, close));
      root.append(svg("rect", { x: x(i) - barW / 2, y: top, width: barW, height: Math.max(1, y(Math.min(open, close)) - top), class: "body " + dir }));
    });

    if (type === "line") {
      root.append(svg("path", { d: shown.map((b, i) => (i ? "L" : "M") + x(i).toFixed(1) + "," + y(b[3]).toFixed(1)).join(""), class: "line" }));
    }

    averages.forEach(([n, line]) => {
      const d = line.map((v, i) => (v === null ? "" : (line[i - 1] == null ? "M" : "L") + x(i).toFixed(1) + "," + y(v).toFixed(1))).join("");
      if (d) root.append(svg("path", { d, class: "ma " + MA_CLASS[n] }));
    });

    // Last price: dotted line with a tag on the price axis
    root.append(svg("line", { x1: pad.left, x2: pad.left + plotW, y1: y(last[3]), y2: y(last[3]), class: "last " + lastDir }));
    root.append(svg("rect", { x: pad.left + plotW + 2, y: y(last[3]) - 9, width: pad.right - 4, height: 18, rx: 3, class: "tag " + lastDir }));
    root.append(svg("text", { x: width - 4, y: y(last[3]) + 4, "text-anchor": "end", class: "tag-text" }, last[3].toFixed(2)));

    // Your open position: a dashed line at your average cost, labelled with the profit or loss so far
    if (position) {
      const pnl = (last[3] - position.avg) * position.shares;
      const dir = pnl >= 0 ? "up" : "down";
      root.append(svg("line", { x1: pad.left, x2: pad.left + plotW, y1: y(position.avg), y2: y(position.avg), class: "cost" }));
      const dollars = Math.abs(pnl).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const label = (position.shares > 0 ? "LONG " : "SHORT ") + Math.abs(position.shares) + " @ " + position.avg.toFixed(2) + "  " +
        (pnl >= 0 ? "+$" : "−$") + dollars + " (" + (pnl >= 0 ? "+" : "−") + Math.abs((pnl / (position.avg * Math.abs(position.shares))) * 100).toFixed(1) + "%)";
      root.append(svg("rect", { x: pad.left + 2, y: y(position.avg) - 20, width: label.length * 7.3 + 10, height: 17, rx: 3, class: "cost-box" }));
      root.append(svg("text", { x: pad.left + 7, y: y(position.avg) - 8, class: "cost-label " + dir }, label));
    }

    // Where the scenario starts: history is on the left of this line
    if (mark > from && mark < bars.length) {
      const mx = x(mark - from) - slot / 2;
      root.append(svg("line", { x1: mx, x2: mx, y1: pad.top, y2: height - pad.bottom, class: "start-line" }));
      root.append(svg("text", { x: mx + 4, y: pad.top + 12, class: "axis" }, "Start"));
    }

    // Headline pins sit on the line between price and volume; hover the day to read the headline
    news.filter(([day]) => day >= from && day < bars.length).forEach(([day]) => {
      const px = x(day - from);
      const py = priceBottom + 6;
      root.append(svg("path", { d: `M${px},${py - 5}l5,5l-5,5l-5,-5z`, class: "pin" }));
    });

    // Trade markers: buys below the day's low, sells and shorts above its high.
    // Yours are lettered circles in your colour, the bot's are small outlined triangles.
    const stacked = {};
    trades.filter((t) => t.day >= from && t.day < bars.length).forEach((t) => {
      const i = t.day - from;
      const buy = t.side === "Buy" || t.side === "Cover";
      const key = i + (buy ? "b" : "s");
      const n = (stacked[key] = (stacked[key] || 0) + 1) - 1;
      const bar = bars[t.day];
      const edge = type === "line" ? bar[3] : buy ? bar[2] : bar[1];
      const gap = 12 + n * 16;
      const cy = buy ? Math.min(y(edge) + gap, priceBottom - 2) : Math.max(y(edge) - gap, pad.top + 6);
      if (t.who === "Bot") {
        const d = buy ? `M${x(i)},${cy - 5}l5,8h-10z` : `M${x(i)},${cy + 5}l5,-8h-10z`;
        root.append(svg("path", { d, class: "mk bot" }));
      } else {
        root.append(svg("circle", { cx: x(i), cy, r: 7, class: "mk you" }));
        root.append(svg("text", { x: x(i), y: cy + 3.5, "text-anchor": "middle", class: "mk-letter" }, buy ? "B" : "S"));
      }
    });

    const cross = svg("line", { y1: pad.top, y2: height - pad.bottom, class: "crosshair", visibility: "hidden" });
    const hit = svg("rect", { x: pad.left, y: 0, width: plotW, height, fill: "transparent" });
    root.append(cross, hit);
    box.replaceChildren(root);

    // The hovered day survives redraws, so the readout stays put while the clock runs
    function show(i) {
      if (i === undefined) {
        cross.setAttribute("visibility", "hidden");
        i = shown.length - 1;
      } else {
        cross.setAttribute("x1", x(i));
        cross.setAttribute("x2", x(i));
        cross.setAttribute("visibility", "visible");
      }
      const at = from + i;
      showReadout(readout, dates[at], bars[at], at ? bars[at - 1][3] : bars[at][0]);
      const that = trades.filter((t) => t.day === at).map((t) => "   " + t.who + " " + t.side.toLowerCase() + " " + t.qty);
      const headline = news.find(([day]) => day === at);
      readout.append(that.join("") + (headline ? "   ◆ " + headline[1] : ""));
    }

    hit.addEventListener("pointermove", (e) => {
      const i = Math.floor((e.clientX - root.getBoundingClientRect().left - pad.left) / slot);
      box.dataset.hover = Math.max(0, Math.min(shown.length - 1, i));
      show(Number(box.dataset.hover));
    });

    hit.addEventListener("pointerleave", () => {
      delete box.dataset.hover;
      show();
    });

    show(box.dataset.hover === undefined ? undefined : Math.min(Number(box.dataset.hover), shown.length - 1));
  };

  // Small line chart with no axes, e.g. the race between you, the bot and the market.
  // series: [{ values, cls, label }]; length stretches the x axis so a line shows how far through it is.
  // A label is written just after the end of its line, moved down if it would overlap the one above.
  window.drawSpark = function (box, series, length) {
    const width = box.clientWidth;
    const height = box.clientHeight || 48;
    const right = series.some((s) => s.label) ? 70 : 2;
    const all = series.flatMap((s) => s.values);
    const min = Math.min(...all);
    const range = Math.max(...all) - min || 1;
    const n = Math.max(length || 0, ...series.map((s) => s.values.length)) - 1 || 1;
    const px = (i) => (i / n) * (width - right - 2) + 2;
    const py = (v) => 6 + (1 - (v - min) / range) * (height - 12);
    const root = svg("svg", { width, height, viewBox: `0 0 ${width} ${height}`, "aria-hidden": "true" });
    for (const s of series) {
      root.append(svg("path", { d: s.values.map((v, i) => (i ? "L" : "M") + px(i).toFixed(1) + "," + py(v).toFixed(1)).join(""), class: s.cls }));
    }
    let below = -Infinity;
    series.filter((s) => s.label).map((s) => ({ s, at: py(s.values.at(-1)) + 4 })).sort((a, b) => a.at - b.at).forEach(({ s, at }) => {
      below = Math.max(at, below + 12);
      root.append(svg("text", { x: px(s.values.length - 1) + 6, y: below, class: "end-label " + s.cls }, s.label));
    });
    box.replaceChildren(root);
  };
})();
