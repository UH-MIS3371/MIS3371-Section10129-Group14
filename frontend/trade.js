// Page-specific behavior for trade.html.
function renderTrade() {
  const params = new URLSearchParams(location.search);
  const symbol = (params.get("symbol") || "AAPL").trim().toUpperCase();

  if (!STOCKS[symbol]) {
    // BR-2 in the browser: unknown symbols never reach the order form
    document.getElementById("stock").hidden = true;
    document.getElementById("not-found").hidden = false;
    document.getElementById("missing-symbol").textContent = symbol || "That stock";
    return;
  }

  const stock = STOCKS[symbol];
  const price = cents(stock.price);
  document.title = symbol + " – MarketStreet";
  document.getElementById("stock-title").textContent = symbol;
  document.getElementById("company").textContent = stock.name;
  document.getElementById("price").textContent = money(price);
  setChange(document.getElementById("change"), price - cents(stock.prev), cents(stock.prev));

  const chart = document.getElementById("stock-chart");
  chart.dataset.points = JSON.stringify(stock.month);
  chart.setAttribute("aria-label", symbol + " price over the last month, ending at " + money(price));

  const stats = [
    ["Open", money(cents(stock.open))],
    ["Day high", money(cents(stock.high))],
    ["Day low", money(cents(stock.low))],
    ["Previous close", money(cents(stock.prev))],
    ["Volume", stock.volume],
    ["52-week range", money(cents(stock.low52)) + " – " + money(cents(stock.high52))],
  ];
  const statsList = document.getElementById("stats");
  for (const [name, value] of stats) statsList.append(el("div", null, el("dt", null, name), el("dd", null, value)));

  document.getElementById("order-title").textContent = "Trade " + symbol;
  document.getElementById("order-price").textContent = "Market · " + money(price);

  const form = document.getElementById("order-form");
  form.elements.stockSymbol.value = symbol;
  const quantityInput = document.getElementById("shareQuantity");
  const hint = document.getElementById("quantity-hint");
  const error = document.getElementById("quantity-error");
  const submit = document.getElementById("submit");

  function tradeType() {
    return form.querySelector("input[name=tradeType]:checked").value;
  }

  // BR-3 in the browser: a positive whole number
  function quantityError() {
    const raw = quantityInput.value.trim();
    if (!/^\d+$/.test(raw) || Number(raw) < 1) return "Enter a whole number of 1 or more.";
    return "";
  }

  function update() {
    const state = loadState();
    const owned = state.holdings[symbol] || 0;
    const type = tradeType();
    const qty = Number(quantityInput.value);
    const valid = !quantityError();

    document.getElementById("owned").textContent = plural(owned, "share") + " · " + money(price * owned);
    document.getElementById("cash").textContent = money(state.cash);

    submit.textContent = "Place " + type + " order";
    submit.className = "button " + type.toLowerCase();

    if (valid) {
      document.getElementById("estimate-text").textContent = type + " " + qty + " " + symbol + " at " + money(price);
      document.getElementById("estimate-total").textContent = money(price * qty);
    } else {
      document.getElementById("estimate-text").textContent = "Enter the number of shares to see your total.";
      document.getElementById("estimate-total").textContent = "—";
    }

    // Warn early; the application still makes the final decision (BR-4, BR-5)
    const maxBuy = Math.floor(state.cash / price);
    hint.className = "help";
    if (type === "Sell") {
      hint.textContent = "You own " + plural(owned, "share") + " of " + symbol + ".";
      if (valid && qty > owned) {
        hint.textContent = "You only own " + plural(owned, "share") + ", so this order will be rejected.";
        hint.className = "help warning";
      }
    } else {
      hint.textContent = "With your cash you can buy up to " + plural(maxBuy, "share") + ".";
      if (valid && qty > maxBuy) {
        hint.textContent = "This costs more than your cash (" + money(state.cash) + "), so this order will be rejected.";
        hint.className = "help warning";
      }
    }
  }

  quantityInput.addEventListener("input", () => {
    if (!error.hidden && !quantityError()) {
      error.hidden = true;
      quantityInput.removeAttribute("aria-invalid");
    }
    update();
  });
  form.querySelectorAll("input[name=tradeType]").forEach((input) => {
    input.addEventListener("change", update);
  });
  form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = quantityError();
  const serverMessage = document.getElementById("server-message");

  serverMessage.textContent = "";

  if (message) {
    error.textContent = message;
    error.hidden = false;
    quantityInput.setAttribute("aria-invalid", "true");
    quantityInput.focus();
    return;
  }

  // Form IDs/names follow the data dictionary. The Week 9 API still uses
  // symbol and quantity, so translate those names only at this boundary.
  const state = loadState();

  const trade = {
    symbol: form.elements.stockSymbol.value,
    tradeType: tradeType(),
    quantity: Number(quantityInput.value),
    orderType: form.elements.orderType.value,
    price: stock.price,
    cash: state.cash / 100,
    sharesOwned: state.holdings[symbol] || 0
  };

  submit.disabled = true;

  try {
    // Send the trade to our Express server
    const response = await fetch("/api/trades", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(trade)
    });

    const result = await response.json();

    if (!response.ok || result.status !== "ACCEPTED") {
      serverMessage.textContent =
        "Trade rejected: " + (result.reason || result.message || "Validation failed.");
      serverMessage.className = "error";
      return;
    }

    serverMessage.textContent =
      "Trade validated by backend. Not executed or saved yet.";
    serverMessage.className = "up";

  } catch (error) {
    serverMessage.textContent =
      "Cannot reach the local backend. Check that the server is running.";
    serverMessage.className = "error";

  } finally {
    submit.disabled = false;
  }
});
update();
}

renderTrade();
