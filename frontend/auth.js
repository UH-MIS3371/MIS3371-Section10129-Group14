// MarketStreet sign-in with Amazon Cognito.
// signin.html sends the email and password straight to Cognito over HTTPS; Cognito checks the password and
// returns tokens. MarketStreet's own servers never receive a password. The tokens are kept in sessionStorage
// (cleared when the tab closes). The ID token goes with every API request, and API Gateway checks it; the
// access token is only sent to Cognito itself (change password, sign out everywhere).
// Every page except the public ones (home, sign-in and help) sends users who are not signed in to sign in.
//
// Guest mode: "Continue as guest" on the sign-in page sets a flag in sessionStorage. While it is set,
// authFetch() never calls the network; guest.js answers every request inside the browser and keeps the guest's
// account in sessionStorage, so nothing is sent to or saved on MarketStreet's servers, and it is gone when the tab closes.

const COGNITO = {
  url: "https://cognito-idp.us-east-1.amazonaws.com/",
  clientId: "39ufd4fucor0jpnhklpdqdo8lh"
};
const TOKEN_KEY = "marketstreet-id-token";
const ACCESS_KEY = "marketstreet-access-token";
const REFRESH_KEY = "marketstreet-refresh-token";
const GUEST_KEY = "marketstreet-guest";
const GUEST_STATE_KEY = "marketstreet-guest-state";
const PUBLIC_PAGE = /\/(index\.html|signin\.html|help\.html)?$/.test(location.pathname);

function storageGet(key) {
  try {
    return sessionStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

// Drops every cached API response (see peek() in app.js)
function clearCache() {
  try {
    Object.keys(sessionStorage).filter((k) => k.startsWith("ms-cache:")).forEach((k) => sessionStorage.removeItem(k));
  } catch (e) {
    // storage blocked: nothing cached
  }
}

function storageClear() {
  clearCache();
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
    sessionStorage.removeItem(GUEST_KEY);
    sessionStorage.removeItem(GUEST_STATE_KEY);
  } catch (e) {
    // storage blocked: nothing to clear
  }
}

const isGuest = () => storageGet(GUEST_KEY) === "1";

// Starts a guest session: a fresh pretend account that lives only in this tab
function startGuest() {
  storageClear();
  try {
    sessionStorage.setItem(GUEST_KEY, "1");
  } catch (e) {
    return false; // storage blocked: a guest session cannot be kept
  }
  return true;
}

// The signed-in user from the saved token, or null if there is none or it expires within a minute.
// Reading the token here is only for display; the server trusts the token only after API Gateway checks it.
// A guest has no token; isGuest tells the pages to say so.
function signedInUser() {
  if (isGuest()) return { token: null, email: "guest", name: "Guest", isAdmin: false, isGuest: true };
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

function accessToken() {
  return storageGet(ACCESS_KEY);
}

function saveToken(idToken, access, refresh) {
  clearCache();
  try {
    sessionStorage.removeItem(GUEST_KEY); // signing in for real ends any guest session
    sessionStorage.removeItem(GUEST_STATE_KEY);
    sessionStorage.setItem(TOKEN_KEY, idToken);
    if (access) sessionStorage.setItem(ACCESS_KEY, access);
    if (refresh) sessionStorage.setItem(REFRESH_KEY, refresh);
  } catch (e) {
    // storage blocked: nothing to save
  }
}

// One call to Cognito's public API. Errors come back as { __type: "...#NotAuthorizedException", message }.
async function cognito(action, body) {
  const response = await fetch(COGNITO.url, {
    method: "POST",
    headers: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": "AWSCognitoIdentityProviderService." + action },
    body: JSON.stringify({ ClientId: COGNITO.clientId, ...body })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.message), { code: String(data.__type || "").split("#").pop() });
  return data;
}

let refreshing = null;

function refreshSession() {
  refreshing ||= (async () => {
    try {
      const result = await cognito("InitiateAuth", { AuthFlow: "REFRESH_TOKEN_AUTH", AuthParameters: { REFRESH_TOKEN: storageGet(REFRESH_KEY) } });
      saveToken(result.AuthenticationResult.IdToken, result.AuthenticationResult.AccessToken);
      return true;
    } catch (e) {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// Goes to the sign-in page, which comes back to this page afterwards
function signIn() {
  location.href = "signin.html?back=" + encodeURIComponent(location.pathname + location.search);
}

function signOut() {
  storageClear();
  location.href = "signin.html?signedOut=1";
}

// guest.js is loaded only when a guest first needs it
let guestScript = null;
function loadGuestScript() {
  guestScript ||= new Promise((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = "guest.js";
    tag.onload = resolve;
    tag.onerror = () => reject(new Error("Guest mode could not load."));
    document.head.append(tag);
  });
  return guestScript;
}

// fetch() with the sign-in token. If there is no token, or the server answers 401, sign in again.
// A guest's request is answered inside the browser by guest.js and never reaches the network.
async function authFetch(url, options = {}) {
  if (isGuest()) {
    await loadGuestScript();
    return guestRespond(url, options);
  }
  if (!signedInUser() && storageGet(REFRESH_KEY)) await refreshSession();
  const send = (user) => fetch(url, { ...options, headers: { ...options.headers, Authorization: "Bearer " + user.token } });
  let user = signedInUser();
  if (user) {
    let response = await send(user);
    if (response.status === 401 && (await refreshSession())) response = await send(signedInUser());
    if (response.status !== 401) return response;
  }
  storageClear();
  signIn();
  return new Promise(() => {}); // the page is leaving for the sign-in page
}

if (!PUBLIC_PAGE && !signedInUser()) {
  if (storageGet(REFRESH_KEY)) refreshSession().then((ok) => ok || signIn());
  else signIn();
}
