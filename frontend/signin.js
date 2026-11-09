// Sign in, create an account, confirm the emailed code and reset a forgotten password, using Amazon Cognito's
// public API (no secret is needed for this app client). Cognito checks passwords and sends the codes;
// MarketStreet's servers never receive a password. After signing in, the ID token is saved and the user
// goes back to the page they came from.

const $ = (id) => document.getElementById(id);
const VIEWS = ["signIn", "signUp", "confirm", "forgot", "reset"];
const back = new URLSearchParams(location.search).get("back");
let pending = { email: "", password: "" }; // kept between "create account" and "confirm", only in memory

// One call to Cognito. Errors come back as { __type: "...#NotAuthorizedException", message }.
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

// Cognito's messages, reworded where they would confuse a player
function explain(error) {
  const messages = {
    NotAuthorizedException: "That email and password don't match.",
    UsernameExistsException: "An account with that email already exists. Sign in instead.",
    CodeMismatchException: "That code is not right. Check the email and try again.",
    ExpiredCodeException: "That code has expired. Send a new one.",
    LimitExceededException: "Too many attempts. Wait a few minutes and try again.",
    TooManyRequestsException: "Too many attempts. Wait a few minutes and try again."
  };
  if (messages[error.code]) return messages[error.code];
  if (error.code === "InvalidPasswordException" || error.code === "InvalidParameterException") return error.message;
  return error.code ? "Something went wrong. Please try again." : "Couldn't reach the sign-in service. Check your connection.";
}

function show(view, message, isError) {
  for (const id of VIEWS) $(id).hidden = id !== view;
  $("tabSignIn").setAttribute("aria-selected", String(view === "signIn"));
  $("tabSignUp").setAttribute("aria-selected", String(view === "signUp"));
  say(message || "", isError);
  const first = $(view).querySelector("input");
  if (first) first.focus();
}

function say(message, isError) {
  $("authMessage").textContent = message;
  $("authMessage").className = "auth-message" + (isError ? " error" : "");
}

// Disables the form's buttons while Cognito answers
async function busy(form, work) {
  const buttons = form.querySelectorAll("button");
  buttons.forEach((b) => (b.disabled = true));
  try {
    await work();
  } catch (e) {
    say(explain(e), true);
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

async function signInWith(email, password) {
  const result = await cognito("InitiateAuth", { AuthFlow: "USER_PASSWORD_AUTH", AuthParameters: { USERNAME: email, PASSWORD: password } });
  if (!result.AuthenticationResult) throw Object.assign(new Error(), { code: "NotAuthorizedException" });
  saveToken(result.AuthenticationResult.IdToken);
  location.replace(back && back.startsWith("/") && !back.startsWith("//") ? back : "trade.html");
}

$("signIn").addEventListener("submit", (e) => {
  e.preventDefault();
  const email = $("signInEmail").value.trim();
  const password = $("signInPassword").value;
  if (!email || !password) return say("Enter your email and password.", true);
  busy(e.target, async () => {
    try {
      await signInWith(email, password);
    } catch (error) {
      if (error.code !== "UserNotConfirmedException") throw error;
      pending = { email, password };
      await cognito("ResendConfirmationCode", { Username: email });
      $("confirmEmail").textContent = email;
      show("confirm", "Confirm your email to finish creating your account.");
    }
  });
});

$("signUp").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("signUpName").value.trim();
  const email = $("signUpEmail").value.trim();
  const password = $("signUpPassword").value;
  if (!/^[A-Za-z0-9 ]{3,20}$/.test(name)) return say("Choose a display name of 3–20 letters, numbers or spaces.", true);
  if (!email || !password) return say("Enter your email and a password.", true);
  busy(e.target, async () => {
    await cognito("SignUp", { Username: email, Password: password, UserAttributes: [{ Name: "email", Value: email }, { Name: "nickname", Value: name }] });
    pending = { email, password };
    $("confirmEmail").textContent = email;
    show("confirm", "Account created. Check your email for the code.");
  });
});

$("confirm").addEventListener("submit", (e) => {
  e.preventDefault();
  const code = $("confirmCode").value.trim();
  if (!/^\d{6}$/.test(code)) return say("Enter the 6-digit code from the email.", true);
  busy(e.target, async () => {
    await cognito("ConfirmSignUp", { Username: pending.email, ConfirmationCode: code });
    await signInWith(pending.email, pending.password);
  });
});

$("resendCode").addEventListener("click", (e) => {
  busy(e.target.form, async () => {
    await cognito("ResendConfirmationCode", { Username: pending.email });
    say("A new code is on its way.");
  });
});

$("forgot").addEventListener("submit", (e) => {
  e.preventDefault();
  const email = $("forgotEmail").value.trim();
  if (!email) return say("Enter your email.", true);
  busy(e.target, async () => {
    await cognito("ForgotPassword", { Username: email });
    pending = { email, password: "" };
    $("resetEmail").textContent = email;
    show("reset", "If that email has an account, a code is on its way.");
  });
});

$("reset").addEventListener("submit", (e) => {
  e.preventDefault();
  const code = $("resetCode").value.trim();
  const password = $("resetPassword").value;
  if (!/^\d{6}$/.test(code) || !password) return say("Enter the code and a new password.", true);
  busy(e.target, async () => {
    await cognito("ConfirmForgotPassword", { Username: pending.email, ConfirmationCode: code, Password: password });
    await signInWith(pending.email, password);
  });
});

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => show(button.dataset.view)));

// Already signed in: go straight back
if (signedInUser()) location.replace(back || "trade.html");
