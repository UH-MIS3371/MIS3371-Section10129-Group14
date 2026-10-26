// Business Rule:
// A trade must have at least 1 share.

function isValidShareQuantity(shares) {
    return shares >= 1 && Number.isInteger(shares);
}

// Test cases
console.log("0.5 shares:", isValidShareQuantity(0.5));
console.log("1 share:", isValidShareQuantity(1));
console.log("5 shares:", isValidShareQuantity(5));
const quantityInput = document.querySelector("#quantity");
const quantityMessage = document.querySelector("#quantityMessage");

quantityInput.addEventListener("input", function () {
    const inputValue = quantityInput.value;

    if (inputValue === "") {
        quantityMessage.textContent = "";
        quantityInput.setCustomValidity("");
        return;
    }

    const quantity = Number(inputValue);

    if (!isValidShareQuantity(quantity)) {
        quantityMessage.textContent =
            "Invalid quantity. Please enter at least 1 whole share.";
        quantityInput.setCustomValidity(
            "Please enter at least 1 whole share."
        );
    } else {
        quantityMessage.textContent = "";
        quantityInput.setCustomValidity("");
    }
});

