// Account settings: display name, password (Cognito), sign out everywhere, and reset the paper account.

const $ = (id) => document.getElementById(id);

function fieldError(id, message) {
  $(id).textContent = message || "";
  $(id).hidden = !message;
}

function renderProfile(me) {
  const u = me.user;
  $("avatar").textContent = initials(u.name);
  $("profileName").textContent = u.name;
  $("profileMeta").textContent = "Member since " + formatDate(u.createdAt) + " · " + plural(me.stats.trades, "accepted order") + " · " + plural(me.stats.finishedGames, "finished challenge");
  if (document.activeElement !== $("displayName")) $("displayName").value = u.name;
  $("emailText").textContent = u.email;
  $("roleText").textContent = u.isAdmin ? "Admin" : "Member";
  $("roleText").className = "pill " + (u.isAdmin ? "admin" : "");
}

async function loadAccountPage() {
  const cached = peek("/me");
  if (cached) renderProfile(cached);
  try {
    renderProfile(await loadMe(true));
    $("loadError").replaceChildren();
  } catch (e) {
    $("loadError").replaceChildren(errorState("Your account could not be loaded. " + e.message, loadAccountPage));
  }
}

$("nameForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("displayName").value.trim();
  if (!/^[A-Za-z0-9 ]{3,20}$/.test(name)) return fieldError("nameError", "Use 3–20 letters, numbers or spaces.");
  fieldError("nameError", "");
  const button = e.target.querySelector("button");
  button.disabled = true;
  try {
    await api("/me", { method: "PATCH", body: { name } });
    toast("Display name saved.");
    renderProfile(await loadMe(true));
  } catch (err) {
    fieldError("nameError", err.message);
  }
  button.disabled = false;
});

$("passwordForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const current = $("currentPassword").value;
  const next = $("newPassword").value;
  if (!current || !next) return fieldError("passwordError", "Enter your current password and a new one.");
  if (!accessToken()) return fieldError("passwordError", "Sign out and sign in again, then change your password.");
  fieldError("passwordError", "");
  const button = e.target.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    await cognito("ChangePassword", { AccessToken: accessToken(), PreviousPassword: current, ProposedPassword: next });
    e.target.reset();
    toast("Password changed.");
  } catch (err) {
    const messages = { NotAuthorizedException: "Your current password isn't right.", LimitExceededException: "Too many attempts. Wait a few minutes and try again." };
    fieldError("passwordError", messages[err.code] || err.message || "Your password could not be changed.");
  }
  button.disabled = false;
});

$("signOutAll").addEventListener("click", async () => {
  const ok = await confirmAction({ title: "Sign out everywhere?", message: "Every device signed in to your account, including this one, will need to sign in again.", confirmLabel: "Sign out everywhere" });
  if (!ok) return;
  try {
    await api("/me/sign-out-everywhere", { method: "POST" });
    if (accessToken()) await cognito("GlobalSignOut", { AccessToken: accessToken() }).catch(() => {});
    signOut();
  } catch (err) {
    toast(err.message, "bad");
  }
});

$("resetAccount").addEventListener("click", async () => {
  const ok = await confirmAction({
    title: "Reset your paper account?",
    message: "Your cash goes back to $10,000 and every holding is removed. This can't be undone. Your order history stays.",
    confirmLabel: "Reset account", danger: true, typeToConfirm: "RESET"
  });
  if (!ok) return;
  try {
    await api("/account/reset", { method: "POST", body: { confirm: "RESET" } });
    await loadMe(true);
    toast("Your account was reset to $10,000.");
  } catch (err) {
    toast(err.message, "bad");
  }
});

loadAccountPage();
