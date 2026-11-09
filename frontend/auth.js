// MarketStreet sign-in with Amazon Cognito.
// Users sign in on Cognito's own login page (authorization code flow with PKCE), so this site never sees a
// password. Cognito sends back a one-time code; signin.html swaps it for an ID token. The token is kept in
// sessionStorage (cleared when the tab closes) and sent with every API request. API Gateway checks it.
// Every page except signin.html loads this file first and sends users who are not signed in to the login page.

const COGNITO = {
  domain: "https://marketstreet-g14-ig7886.auth.us-east-1.amazoncognito.com",
  clientId: "39ufd4fucor0jpnhklpdqdo8lh",
  redirect: location.origin + "/signin.html"
};
const TOKEN_KEY = "marketstreet-id-token";
const SIGNIN_KEY = "marketstreet-signin";

function storageGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// The signed-in user from the saved token, or null if there is none or it expires within a minute.
// Reading the token here is only for display; the server trusts the token only after API Gateway checks it.
function signedInUser() {
  const token = storageGet(TOKEN_KEY);
  if (!token) return null;
  try {
    const claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (claims.exp * 1000 < Date.now() + 60000) return null;
    return { token, email: claims.email, isAdmin: (claims["cognito:groups"] || []).includes("admins") };
  } catch (e) {
    return null;
  }
}

// Sends the user to Cognito's login page, remembering this page so signin.html can come back to it
async function signIn() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem(SIGNIN_KEY, JSON.stringify({ verifier, state, back: location.pathname + location.search }));
  location.href = COGNITO.domain + "/oauth2/authorize?" + new URLSearchParams({
    response_type: "code", client_id: COGNITO.clientId, redirect_uri: COGNITO.redirect,
    scope: "openid email", code_challenge_method: "S256", code_challenge: challenge, state
  });
}

// On signin.html: swaps Cognito's one-time code for the ID token, then goes back to the page the user was on
async function finishSignIn() {
  const params = new URLSearchParams(location.search);
  const saved = JSON.parse(storageGet(SIGNIN_KEY) || "null");
  if (!params.get("code") || !saved || params.get("state") !== saved.state) return false;
  const response = await fetch(COGNITO.domain + "/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code", client_id: COGNITO.clientId, code: params.get("code"),
      redirect_uri: COGNITO.redirect, code_verifier: saved.verifier
    })
  });
  if (!response.ok) return false;
  sessionStorage.setItem(TOKEN_KEY, (await response.json()).id_token);
  sessionStorage.removeItem(SIGNIN_KEY);
  location.replace(saved.back || "/trade.html");
  return true;
}

function signOut() {
  sessionStorage.removeItem(TOKEN_KEY);
  location.href = COGNITO.domain + "/logout?" + new URLSearchParams({ client_id: COGNITO.clientId, logout_uri: COGNITO.redirect });
}

// fetch() with the sign-in token. If there is no token, or the server answers 401, sign in again.
async function authFetch(url, options = {}) {
  const user = signedInUser();
  if (user) {
    const response = await fetch(url, { ...options, headers: { ...options.headers, Authorization: "Bearer " + user.token } });
    if (response.status !== 401) return response;
    sessionStorage.removeItem(TOKEN_KEY);
  }
  await signIn();
  return new Promise(() => {}); // the page is leaving for the login page
}

// Shows who is signed in, a Sign out button, and the Admin link for admins
function showSignedInUser(user) {
  const nav = document.querySelector(".site-nav");
  if (!nav) return;
  if (user.isAdmin) nav.append(Object.assign(document.createElement("a"), { href: "admin.html", textContent: "Admin" }));
  let label = nav.querySelector(".account");
  if (!label) label = nav.appendChild(Object.assign(document.createElement("span"), { className: "account" }));
  label.textContent = user.email;
  const button = Object.assign(document.createElement("button"), { type: "button", className: "signout", textContent: "Sign out" });
  button.addEventListener("click", signOut);
  nav.append(button);
}

if (!location.pathname.endsWith("/signin.html")) {
  const user = signedInUser();
  if (user) document.addEventListener("DOMContentLoaded", () => showSignedInUser(user));
  else signIn();
}
