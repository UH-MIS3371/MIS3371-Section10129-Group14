// Simulated market data and account (no backend yet)
const PRICES = {
  AAPL: 185.5,
  MSFT: 412.3,
  TSLA: 248.1,
  AMZN: 178.25,
  GOOGL: 164.8,
  NVDA: 121.4,
  IBM: 221.1,
  // Consider limiting the amount of stocks shown here
};

const account = {
  cash: 10000,
  holdings: { AAPL: 10, MSFT: 2, TSLA: 1 },
};

let nextId = 418;

const form = document.getElementById("trade-form");
const symbolInput = document.getElementById("symbol");
const sharesInput = document.getElementById("shares");
const priceInput = document.getElementById("price");
const limitBox = document.getElementById("limit-box");
const chipsBox = document.getElementById("symbol-chips");
const submitBtn = document.getElementById("submit-btn");
const result = document.getElementById("result");

function money(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function getTrade() {
  return form.querySelector("input[name=trade]:checked").value;
}

function getOrder() {
  return form.querySelector("input[name=order]:checked").value;
}

function getSymbol() {
  return symbolInput.value.trim().toUpperCase();
}

function getShares() {
  return Number(sharesInput.value);
}

// Price used for the estimate: limit price if set, otherwise market price
function getPrice(symbol) {
  if (getOrder() === "limit" && Number(priceInput.value) > 0) {
    return Number(priceInput.value);
  }
  return PRICES[symbol];
}

// Largest whole number of shares the user can buy or sell right now
function maxShares() {
  const symbol = getSymbol();
  if (!PRICES[symbol]) return 0;
  if (getTrade() === "sell") return account.holdings[symbol] || 0;
  return Math.floor(account.cash / getPrice(symbol));
}

// ---------- Build the popular-stock chips ----------
for (const symbol in PRICES) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "chip";
  chip.dataset.symbol = symbol;
  chip.setAttribute("aria-pressed", "false");
  chip.innerHTML = "<b>" + symbol + "</b><span>" + money(PRICES[symbol]) + "</span>";
  chip.addEventListener("click", () => {
    symbolInput.value = symbol;
    update();
  });
  chipsBox.appendChild(chip);
}

// ---------- Keep the screen in sync with the inputs ----------
function update() {
  const trade = getTrade();
  const symbol = getSymbol();
  const shares = getShares();
  const known = Boolean(PRICES[symbol]);
  const verb = trade === "buy" ? "Buy" : "Sell";

  // Account box
  document.getElementById("cash").textContent = money(account.cash);
  document.getElementById("owned").textContent = known
    ? (account.holdings[symbol] || 0) + " " + symbol
    : "—";

  // Highlight the matching chip
  chipsBox.querySelectorAll(".chip").forEach((chip) => {
    chip.setAttribute("aria-pressed", String(chip.dataset.symbol === symbol));
  });

  document.getElementById("symbol-help").textContent = known
    ? "Current price: " + money(PRICES[symbol])
    : "";

  // Order type
  const isLimit = getOrder() === "limit";
  limitBox.hidden = !isLimit;
  document.getElementById("order-summary").textContent = isLimit
    ? "Limit (only at your price)"
    : "Market (best price now)";

  // Summary + button
  const summary = document.getElementById("summary-text");
  const totalEl = document.getElementById("total");
  if (known && shares > 0) {
    const total = shares * getPrice(symbol);
    summary.textContent =
      verb + " " + shares + " share" + (shares === 1 ? "" : "s") + " of " + symbol +
      " at " + money(getPrice(symbol)) + " each.";
    totalEl.textContent = money(total);
    submitBtn.textContent = verb + " " + shares + " " + symbol;
  } else {
    summary.textContent = "Pick a stock to see your estimated total.";
    totalEl.textContent = money(0);
    submitBtn.textContent = verb;
  }
  submitBtn.className = "submit " + trade;
}

// ---------- Validation (shows friendly messages next to each field) ----------
function setError(input, id, message) {
  document.getElementById(id).textContent = message;
  input.setAttribute("aria-invalid", message ? "true" : "false");
  return !message;
}

function validate() {
  const symbol = getSymbol();
  const shares = sharesInput.value;
  let ok = true;

  if (!symbol) {
    ok = setError(symbolInput, "symbol-error", "Choose a stock above or type a symbol.") && ok;
  } else if (!PRICES[symbol]) {
    ok = setError(symbolInput, "symbol-error", symbol + " isn't available. Try one of the stocks above.") && ok;
  } else {
    setError(symbolInput, "symbol-error", "");
  }

  if (!/^\d+$/.test(shares) || Number(shares) < 1) {
    ok = setError(sharesInput, "shares-error", "Enter a whole number of 1 or more.") && ok;
  } else {
    setError(sharesInput, "shares-error", "");
  }

  if (getOrder() === "limit" && !(Number(priceInput.value) > 0)) {
    ok = setError(priceInput, "price-error", "Enter a limit price above $0.") && ok;
  } else {
    setError(priceInput, "price-error", "");
  }

  return ok;
}

// ---------- Submit: apply business rules and show the result ----------
function submitTrade(event) {
  event.preventDefault();
  if (!validate()) {
    form.querySelector("[aria-invalid=true]").focus();
    return;
  }

  const trade = getTrade();
  const symbol = getSymbol();
  const shares = getShares();
  const price = getPrice(symbol);
  const total = shares * price;
  const owned = account.holdings[symbol] || 0;

  let reason = "";
  if (trade === "buy" && total > account.cash) {
    reason = "Not enough cash. You have " + money(account.cash) + ".";
  } else if (trade === "sell" && shares > owned) {
    reason = "You only own " + owned + " share" + (owned === 1 ? "" : "s") + " of " + symbol + ".";
  }

  // Update the simulated portfolio only when accepted
  if (!reason) {
    if (trade === "buy") {
      account.cash -= total;
      account.holdings[symbol] = owned + shares;
    } else {
      account.cash += total;
      account.holdings[symbol] = owned - shares;
    }
  }

  const record = {
    "Transaction ID": "TRD-" + String(nextId++).padStart(5, "0"),
    Action: (trade === "buy" ? "Buy " : "Sell ") + shares + " " + symbol,
    "Price per share": money(price),
    Total: money(total),
    Status: reason ? "Rejected" : "Accepted",
    Time: new Date().toLocaleTimeString(),
  };
  if (reason) record.Reason = reason;

  console.log(record);
  showResult(!reason, record);
}

function showResult(accepted, record) {
  document.getElementById("result-title").textContent = accepted
    ? "✓ Trade complete"
    : "✗ Trade not placed";
  result.className = "result " + (accepted ? "accepted" : "rejected");

  const details = document.getElementById("result-details");
  details.innerHTML = "";
  for (const key in record) {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = key;
    dd.textContent = record[key];
    details.append(dt, dd);
  }

  form.hidden = true;
  result.hidden = false;
  document.getElementById("new-trade").focus();
  update();
}

// ---------- Wire up events ----------
document.getElementById("minus").addEventListener("click", () => {
  sharesInput.value = Math.max(1, getShares() - 1 || 1);
  update();
});

document.getElementById("plus").addEventListener("click", () => {
  sharesInput.value = (getShares() || 0) + 1;
  update();
});

document.getElementById("max-btn").addEventListener("click", () => {
  const max = maxShares();
  if (max > 0) sharesInput.value = max;
  update();
});

document.getElementById("new-trade").addEventListener("click", () => {
  result.hidden = true;
  form.hidden = false;
  sharesInput.value = 1;
  update();
});

symbolInput.addEventListener("input", () => {
  symbolInput.value = symbolInput.value.toUpperCase();
});

// Validate shares as the user types so decimals show the error immediately
sharesInput.addEventListener("input", () => {
  // show the same message used on submit when the value is not a whole number >= 1
  if (!/^\d+$/.test(sharesInput.value) || Number(sharesInput.value) < 1) {
    setError(sharesInput, "shares-error", "Enter a whole number of 1 or more.");
  } else {
    setError(sharesInput, "shares-error", "");
  }
  update();
});

form.addEventListener("input", update);
form.addEventListener("change", update);
form.addEventListener("submit", submitTrade);

update();
