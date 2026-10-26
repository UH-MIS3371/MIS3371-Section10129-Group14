// Rule 1 (BR-3): Stock trades must use at least 1 whole share.
function isValidShareQuantity(shares) {
  return shares >= 1 && Number.isInteger(shares);
}

// Rule 2: A Limit order needs a positive price; a Market order does not.
function isValidLimitPrice(order, price) {
  if (order === "limit") {
    return Number.isFinite(price) && price > 0;
  }
  return true;
}

const tradeForm = document.querySelector("#tradeForm");
const sharesInput = document.querySelector("#shares");
const sharesMessage = document.querySelector("#sharesMessage");
const orderInput = document.querySelector("#order");
const priceInput = document.querySelector("#price");
const priceMessage = document.querySelector("#priceMessage");
const submitMessage = document.querySelector("#submitMessage");

function validateShares() {
  const shares = Number(sharesInput.value);

  if (isValidShareQuantity(shares)) {
    sharesMessage.textContent = "";
  } else {
    sharesMessage.textContent = "Please enter at least 1 whole share.";
  }

  sharesInput.setCustomValidity(sharesMessage.textContent);
  return isValidShareQuantity(shares);
}

function validatePrice() {
  const order = orderInput.value;
  const price = Number(priceInput.value);

  // Enable and require the price only when the user selects Limit.
  priceInput.disabled = order !== "limit";
  priceInput.required = order === "limit";

  if (isValidLimitPrice(order, price)) {
    priceMessage.textContent = "";
  } else {
    priceMessage.textContent = "Limit orders need a price greater than $0.";
  }

  priceInput.setCustomValidity(priceMessage.textContent);
  return isValidLimitPrice(order, price);
}

function clearSubmitMessage() {
  submitMessage.textContent = "";
}

function submitTrade(event) {
  // Keep this client-side exercise on the page; there is no backend yet.
  event.preventDefault();

  // Recheck the current DOM values, even if no input event occurred.
  const validShares = validateShares();
  const validPrice = validatePrice();

  if (!validShares || !validPrice) {
    submitMessage.className = "error";
    submitMessage.textContent = "Please fix the errors before submitting.";
    tradeForm.reportValidity();
    return;
  }

  // Also check the HTML required, min, and step constraints.
  if (!tradeForm.reportValidity()) {
    submitMessage.className = "error";
    submitMessage.textContent = "Please complete the required fields with valid values.";
    return;
  }

  submitMessage.className = "success";
  submitMessage.textContent = "Trade details passed the browser validation checks.";
}

sharesInput.addEventListener("input", validateShares);
orderInput.addEventListener("change", validatePrice);
priceInput.addEventListener("input", validatePrice);
tradeForm.addEventListener("input", clearSubmitMessage);
tradeForm.addEventListener("change", clearSubmitMessage);
tradeForm.addEventListener("submit", submitTrade);

validatePrice();

// Rule tests: open the browser console to see any failed assertions.
// The 1-share and $0.01 cases test the smallest allowed values.
console.assert(isValidShareQuantity(0) === false, "0 shares must fail.");
console.assert(isValidShareQuantity(0.5) === false, "Fractional shares must fail.");
console.assert(isValidShareQuantity(1) === true, "1 share must pass (boundary).");
console.assert(isValidShareQuantity(5) === true, "5 shares must pass.");
console.assert(isValidLimitPrice("limit", Number("")) === false, "A blank limit price must fail.");
console.assert(isValidLimitPrice("limit", 0) === false, "A $0 limit price must fail.");
console.assert(isValidLimitPrice("limit", 0.01) === true, "$0.01 must pass (boundary).");
console.assert(isValidLimitPrice("market", Number("")) === true, "Market orders do not need a limit price.");
console.log("Week 7: finished 8 rule checks. Any failure appears as an assertion error.");
