// MarketStreet page shell: header, navigation, account menu, footer, toasts and confirmation dialogs.
// Every page sets <body data-shell="app|admin|public" data-nav="..."> and loads this file after app.js.
// The shell is built here once, so no page repeats the navigation markup.

const LOGO_SVG = '<svg class="logo-mark" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="11" width="4" height="9" rx="1" fill="#5b93db"/><rect x="10" y="6" width="4" height="14" rx="1" fill="#3fb68b"/><rect x="17" y="2" width="4" height="18" rx="1" fill="#f3f3f5"/></svg>';

const APP_NAV = [
  ["dashboard", "Home", "dashboard.html"],
  ["markets", "Markets", "markets.html"],
  ["activity", "Activity", "activity.html"],
  ["challenges", "Challenges", "scenarios.html"],
  ["leaderboard", "Leaderboard", "leaderboard.html", "Leaders"],
  ["demo", "Demo", "demo.html"]
];

const ICONS = {
  overview: "M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z",
  users: "M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21a8 8 0 0 1 16 0",
  trades: "M4 7h13l-3-3m6 13H7l3 3",
  games: "M6 12h4m-2-2v4m7-1h.01M18 11h.01M7 6h10a5 5 0 0 1 0 10H7A5 5 0 0 1 7 6z",
  audit: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4"
};

const ADMIN_NAV = [
  ["overview", "Overview", "admin.html"],
  ["users", "Users", "admin-users.html"],
  ["trades", "Trades", "admin-trades.html"],
  ["games", "Games", "admin-games.html"],
  ["audit", "Audit log", "admin-audit.html"]
];

function icon(name) {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + ICONS[name] + '"/></svg>';
}

// ======================= THE SIGNED-IN USER =======================

// GET /api/me, cached for a minute in this tab so moving between pages is quick.
// Call with fresh = true after changing the profile or account.
let mePromise = null;
function loadMe(fresh) {
  if (mePromise && !fresh) return mePromise;
  const cached = !fresh && peek("/me", 60000);
  mePromise = cached ? Promise.resolve(cached) : api("/me");
  mePromise.catch(() => (mePromise = null));
  return mePromise;
}

// ======================= HEADER AND FOOTER =======================

function searchForm() {
  const list = el("datalist", { id: "stockList" });
  if (typeof STOCKS !== "undefined") for (const s in STOCKS) list.append(el("option", { value: s }, STOCKS[s].name));
  const form = el("form", { class: "search", action: "trade.html", role: "search" },
    el("label", { for: "headerSearch", class: "visually-hidden" }, "Search stocks"),
    el("input", { id: "headerSearch", name: "symbol", type: "search", list: "stockList", placeholder: "Search stocks", autocomplete: "off", "aria-keyshortcuts": "/" }),
    list);
  return form;
}

function accountMenu(me) {
  const user = me.user;
  const panel = el("div", { class: "menu-panel", id: "accountMenu", hidden: true },
    el("div", { class: "menu-who" }, el("strong", null, user.name), el("span", null, user.email)),
    el("a", { href: "dashboard.html" }, "Portfolio"),
    el("a", { href: "account.html" }, "Account settings"),
    user.isAdmin ? el("a", { href: "admin.html" }, "Admin console", pill("Admin", "admin")) : null,
    el("a", { href: "help.html" }, "Help"),
    el("button", { type: "button", onclick: signOut }, "Sign out"));
  const button = el("button", { type: "button", "aria-expanded": "false", "aria-controls": "accountMenu", title: user.name },
    el("span", { class: "avatar" }, initials(user.name)), el("span", { class: "visually-hidden" }, "Account menu"));
  const menu = el("div", { class: "menu" }, button, panel);
  const close = () => { panel.hidden = true; button.setAttribute("aria-expanded", "false"); };
  button.addEventListener("click", (e) => {
    e.stopPropagation();
    panel.hidden = !panel.hidden;
    button.setAttribute("aria-expanded", String(!panel.hidden));
  });
  document.addEventListener("click", (e) => { if (!menu.contains(e.target)) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  return menu;
}

function appHeader(current) {
  let header = document.querySelector(".site-header");
  if (!header) header = document.body.insertBefore(el("header", { class: "site-header" }, el("div", { class: "inner" })), document.body.firstChild);
  const inner = header.querySelector(".inner");
  header.querySelectorAll(".logo, .site-nav").forEach((n) => n.remove());
  const logo = el("a", { class: "logo", href: "dashboard.html" });
  logo.innerHTML = LOGO_SVG + "<span>MarketStreet</span>";
  const nav = el("nav", { class: "site-nav", "aria-label": "Main" },
    APP_NAV.map(([key, label, href, short]) => el("a", { href, "aria-current": key === current ? "page" : null, title: short ? label : null },
      short ? [el("span", { class: "nav-long" }, label), el("span", { class: "nav-short" }, short)] : label)));
  const tools = el("div", { class: "header-tools" }, searchForm(), el("button", { type: "button", class: "btn sm qr-btn", "aria-haspopup": "dialog", onclick: openQr }, "QR code"), el("span", { class: "paper-badge", title: "Simulated money and prices" }, "Paper trading"));
  inner.prepend(logo, nav);
  // Scenario Mode keeps its clock in the header; the tools go after it
  inner.append(tools);
  // The avatar's place is held while the profile loads, so nothing in the header moves
  const slot = el("span", { class: "avatar", "aria-hidden": "true" });
  tools.append(slot);
  loadMe().then((me) => slot.replaceWith(accountMenu(me))).catch(() => slot.replaceWith(el("button", { type: "button", class: "btn sm", onclick: signOut }, "Sign out")));
}

function publicHeader() {
  const user = signedInUser();
  const logo = el("a", { class: "logo", href: "index.html" });
  logo.innerHTML = LOGO_SVG + "<span>MarketStreet</span>";
  const actions = user
    ? el("div", { class: "header-tools" }, el("a", { class: "btn primary", href: "dashboard.html" }, "Open MarketStreet"))
    : el("div", { class: "header-tools" }, el("a", { class: "btn", href: "signin.html" }, "Sign in"), el("a", { class: "btn primary", href: "signin.html?view=signUp" }, "Create free account"));
  document.body.prepend(el("header", { class: "site-header landing-header" }, el("div", { class: "inner" }, logo, actions)));
}

function footer() {
  document.body.append(el("footer", { class: "site-footer" }, el("div", { class: "inner" },
    el("p", { class: "disclaimer" }, "MarketStreet is a simulated trading platform for learning. Prices are simulated, no real money changes hands, and nothing here is investment advice."),
    el("nav", { "aria-label": "Footer" },
      el("a", { href: "help.html" }, "Help"),
      el("a", { href: "help.html#rules" }, "Trading rules"),
      el("a", { href: "help.html#terms" }, "Terms"),
      el("a", { href: "help.html#privacy" }, "Privacy"),
      el("span", null, "© " + new Date().getFullYear() + " MarketStreet")))));
}

// ======================= ADMIN SHELL =======================

function adminShell(current) {
  const logo = el("a", { class: "logo", href: "admin.html" });
  logo.innerHTML = LOGO_SVG + "<span>MarketStreet</span>";
  const nav = el("nav", { "aria-label": "Admin" }, ADMIN_NAV.map(([key, label, href]) => {
    const a = el("a", { href, "aria-current": key === current ? "page" : null });
    a.innerHTML = icon(key);
    a.append(label);
    return a;
  }));
  const foot = el("div", { class: "side-foot" }, el("a", { href: "dashboard.html" }, "Back to MarketStreet"), el("button", { type: "button", class: "btn sm", onclick: signOut }, "Sign out"));
  const side = el("aside", { class: "admin-side" }, el("div", null, logo, el("span", { class: "scope" }, "Admin console")), nav, foot);
  const main = document.querySelector("main");
  const top = el("div", { class: "admin-top" }, el("ol", { class: "crumbs", id: "crumbs" }), el("span", { class: "muted", id: "updatedAt" }));
  const wrap = el("div", { class: "admin-main" }, top);
  main.replaceWith(wrap);
  wrap.append(main);
  document.body.prepend(side);
  loadMe().then((me) => foot.prepend(el("span", null, "Signed in as " + me.user.email))).catch(() => {});
}

// [["Users", "admin-users.html"], ["alex@…"]]
function setCrumbs(items) {
  const list = document.getElementById("crumbs");
  if (!list) return;
  list.replaceChildren(...[["Admin", "admin.html"], ...items].map(([label, href]) => el("li", null, href ? el("a", { href }, label) : el("span", { "aria-current": "page" }, label))));
}

function markUpdated() {
  const stamp = document.getElementById("updatedAt");
  if (stamp) stamp.textContent = "Updated " + new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// Admin pages call this first. Resolves to true for admins; for anyone else it replaces the page with a
// short explanation. (The server refuses every admin request from a non-admin anyway.)
async function requireAdmin() {
  try {
    const me = await loadMe();
    if (me.user.isAdmin) return true;
  } catch (e) {
    // fall through to the message
  }
  document.querySelector("main").replaceChildren(el("div", { class: "page" }, el("div", { class: "panel" },
    emptyState("Admins only", "Your account doesn't have access to the admin console.", el("a", { class: "btn primary", href: "dashboard.html" }, "Back to MarketStreet")))));
  return false;
}

// ======================= FEEDBACK =======================

function toast(message, kind) {
  let region = document.querySelector(".toasts");
  if (!region) region = document.body.appendChild(el("div", { class: "toasts", role: "status", "aria-live": "polite" }));
  const t = el("div", { class: "toast " + (kind || "") }, message);
  region.append(t);
  setTimeout(() => t.remove(), 4500);
}

// A confirmation dialog. Resolves to { reason } when confirmed, or null when cancelled.
//   typeToConfirm: text the user must type exactly before the button turns on
//   reason: true to ask for an optional note (saved in the audit log)
function confirmAction({ title, message, confirmLabel, danger, typeToConfirm, reason, extra }) {
  return new Promise((resolve) => {
    const typed = typeToConfirm ? el("input", { type: "text", id: "confirmTyped", autocomplete: "off", spellcheck: "false" }) : null;
    const note = reason ? el("textarea", { id: "confirmReason", rows: "2", maxlength: "200" }) : null;
    const ok = el("button", { type: "submit", class: "btn " + (danger ? "danger solid" : "primary"), disabled: Boolean(typeToConfirm) }, confirmLabel);
    const dialog = el("dialog", { class: "modal" },
      el("form", { method: "dialog" },
        el("h2", null, title),
        el("p", null, message),
        extra || null,
        typed ? el("div", { class: "field" }, el("label", { for: "confirmTyped" }, "Type ", el("strong", { class: "mono" }, typeToConfirm), " to confirm"), typed) : null,
        note ? el("div", { class: "field" }, el("label", { for: "confirmReason" }, "Reason (optional)"), note) : null,
        el("div", { class: "button-row" }, el("button", { type: "button", class: "btn", value: "cancel", onclick: () => dialog.close("cancel") }, "Cancel"), ok)));
    if (typed) typed.addEventListener("input", () => (ok.disabled = typed.value.trim() !== typeToConfirm));
    ok.value = "ok";
    dialog.addEventListener("close", () => {
      resolve(dialog.returnValue === "ok" ? { reason: note ? note.value.trim() : "", dialog } : null);
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
  });
}

// ======================= QR CODE =======================

// The address people scan: this site when it is online, otherwise the link below (editable in the dialog, remembered here)
const LIVE_URL = "https://main.dpq307ec2nc5x.amplifyapp.com";

function qrTarget() {
  try {
    const saved = localStorage.getItem("marketstreet-qr-url");
    if (saved) return saved;
  } catch (e) {
    // storage blocked: use the default
  }
  return /^(localhost|127\.|192\.168\.)/.test(location.hostname) ? LIVE_URL : location.origin;
}

let qrLibrary;
function loadQrLibrary() {
  if (window.qrcode) return Promise.resolve();
  qrLibrary = qrLibrary || new Promise((resolve, reject) => {
    const s = el("script", { src: "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js" });
    s.onload = resolve;
    s.onerror = () => { qrLibrary = null; reject(new Error("QR library failed to load")); };
    document.head.append(s);
  });
  return qrLibrary;
}

// A large QR code for the audience: scan it to open the site on a phone and follow along
async function openQr() {
  const box = el("div", { class: "qr-box", role: "img", "aria-label": "QR code for the MarketStreet link" }, el("span", { class: "skeleton", style: "height: 232px" }));
  const input = el("input", { type: "text", id: "qrUrl", value: qrTarget(), spellcheck: "false", autocomplete: "off" });
  const draw = () => {
    const url = input.value.trim();
    try {
      const qr = window.qrcode(0, "M");
      qr.addData(url);
      qr.make();
      box.innerHTML = qr.createSvgTag(6, 0);
    } catch (e) {
      box.textContent = url ? "That link is too long for a QR code." : "Enter a link.";
    }
  };
  const dialog = el("dialog", { class: "modal qr-dialog" },
    el("form", { method: "dialog" },
      el("h2", null, "Follow along on your phone"),
      el("p", null, "Scan this code with your camera to open MarketStreet."),
      box,
      el("div", { class: "field" }, el("label", { for: "qrUrl" }, "Link"), input,
        el("p", { class: "help" }, "Paste the final site address here before presenting. It is remembered in this browser.")),
      el("div", { class: "button-row" },
        el("button", { type: "button", class: "btn", onclick: () => navigator.clipboard.writeText(input.value.trim()).then(() => toast("Link copied.")) }, "Copy link"),
        el("button", { type: "submit", class: "btn primary" }, "Close"))));
  dialog.addEventListener("close", () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  try {
    await loadQrLibrary();
    draw();
    input.addEventListener("input", () => {
      try {
        localStorage.setItem("marketstreet-qr-url", input.value.trim());
      } catch (e) {
        // storage blocked: the code still updates
      }
      draw();
    });
  } catch (e) {
    box.replaceChildren(el("p", { class: "note", style: "padding: 8px" }, "The QR code could not be made. Check the internet connection and try again."));
  }
}

// ======================= BUILD THE SHELL =======================

// Pages a visitor is about to open are fetched when they hover or touch the link (Chrome and Edge)
function prefetchLinks() {
  if (!HTMLScriptElement.supports || !HTMLScriptElement.supports("speculationrules")) return;
  const rules = el("script", { type: "speculationrules" });
  rules.textContent = JSON.stringify({ prefetch: [{ where: { and: [{ href_matches: "/*.html*" }, { not: { href_matches: "/signin.html*" } }] }, eagerness: "moderate" }] });
  document.head.append(rules);
}

// "/" jumps to the stock search from anywhere outside a text field
document.addEventListener("keydown", (e) => {
  const search = document.getElementById("headerSearch");
  if (e.key !== "/" || !search || e.target.closest("input, textarea, select, [contenteditable]")) return;
  e.preventDefault();
  search.focus();
});

// After the page settles, fetch what the other pages need so they open with data, not placeholders
function warmCache() {
  (window.requestIdleCallback || setTimeout)(() => {
    loadQuotes();
    if (!peek("/trades", 60000)) api("/trades").catch(() => {});
  });
}

(function buildShell() {
  // A public page that uses the app shell (Help) shows the public header to visitors who aren't signed in
  const shell = document.body.dataset.shell === "app" && !signedInUser() ? "public" : document.body.dataset.shell;
  const nav = document.body.dataset.nav;
  if (shell === "app") {
    appHeader(nav);
    footer();
    warmCache();
  } else if (shell === "admin") {
    document.body.classList.add("admin");
    adminShell(nav);
  } else if (shell === "public") {
    publicHeader();
    footer();
  }
  prefetchLinks();
})();
