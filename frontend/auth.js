// MarketStreet sign-in with Amazon Cognito.
// signin.html sends the email and password straight to Cognito over HTTPS; Cognito checks the password and
// returns an ID token. MarketStreet's own servers never receive a password. The token is kept in
// sessionStorage (cleared when the tab closes) and sent with every API request, and API Gateway checks it.
// Every page except signin.html loads this file first and sends users who are not signed in to signin.html.

const COGNITO = {
  url: "https://cognito-idp.us-east-1.amazonaws.com/",
  clientId: "39ufd4fucor0jpnhklpdqdo8lh"
};
const TOKEN_KEY = "marketstreet-id-token";

function storageGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

// The signed-in user from the saved token, or null if there is none or it expires within a minute.
// Reading the token here is only for display; the server trusts the token only after API Gateway checks it.
function signedInUser() {
  const token = storageGet(TOKEN_KEY);
  if (!token) return null;
  try {
    const claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (claims.exp * 1000 < Date.now() + 60000) return null;
    return { token, email: claims.email, name: claims.nickname || claims.email, isAdmin: (claims["cognito:groups"] || []).includes("admins") };
  } catch (e) {
    return null;
  }
}

function saveToken(idToken) {
  sessionStorage.setItem(TOKEN_KEY, idToken);
}

// Goes to the sign-in page, which comes back to this page afterwards
function signIn() {
  location.href = "signin.html?back=" + encodeURIComponent(location.pathname + location.search);
}

function signOut() {
  sessionStorage.removeItem(TOKEN_KEY);
  location.href = "signin.html";
}

// fetch() with the sign-in token. If there is no token, or the server answers 401, sign in again.
async function authFetch(url, options = {}) {
  const user = signedInUser();
  if (user) {
    const response = await fetch(url, { ...options, headers: { ...options.headers, Authorization: "Bearer " + user.token } });
    if (response.status !== 401) return response;
    sessionStorage.removeItem(TOKEN_KEY);
  }
  signIn();
  return new Promise(() => {}); // the page is leaving for the sign-in page
}

// Shows who is signed in, a Sign out button, and the Admin link for admins
function showSignedInUser(user) {
  const nav = document.querySelector(".site-nav");
  if (!nav) return;
  if (user.isAdmin) nav.append(Object.assign(document.createElement("a"), { href: "admin.html", textContent: "Admin" }));
  let label = nav.querySelector(".account");
  if (!label) label = nav.appendChild(Object.assign(document.createElement("span"), { className: "account" }));
  label.textContent = user.name;
  label.title = user.email;
  const button = Object.assign(document.createElement("button"), { type: "button", className: "signout", textContent: "Sign out" });
  button.addEventListener("click", signOut);
  nav.append(button);
}

if (!location.pathname.endsWith("/signin.html")) {
  const user = signedInUser();
  if (user) document.addEventListener("DOMContentLoaded", () => showSignedInUser(user));
  else signIn();
}
