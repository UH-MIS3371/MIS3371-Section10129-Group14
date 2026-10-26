function isValidShareQuantity(shares) {
  return shares >= 1 && Number.isInteger(shares);
}

const sharesInput = document.querySelector("#shares");
const sharesMessage = document.querySelector("#sharesMessage");

sharesInput.addEventListener("input", function () {
  const shares = Number(sharesInput.value);

  if (sharesInput.value === "") {
    sharesMessage.textContent = "";
  } else if (isValidShareQuantity(shares)) {
    sharesMessage.textContent = "";
  } else {
    sharesMessage.textContent = "Please enter at least 1 whole share.";
  }
});

console.log("0.5 shares:", isValidShareQuantity(0.5));
console.log("1 share:", isValidShareQuantity(1));
console.log("5 shares:", isValidShareQuantity(5));