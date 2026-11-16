// Page-specific behavior for login.html.
function renderLogin() {
  document.getElementById("login-form").addEventListener("submit", (event) => {
    event.preventDefault();
    location.href = "trade.html";
  });
}

renderLogin();
