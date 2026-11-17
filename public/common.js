// common.js: small helpers shared by every page.

// Talk to the backend. Sends and receives JSON; throws an Error with a readable message if something fails.
async function api(url, method = "GET", body) {
  const options = { method, headers: { "Content-Type": "application/json" } };
  if (method === "POST") options.body = JSON.stringify(body || {});
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error || "Something went wrong."); err.status = res.status; throw err; }
  return data;
}

// Make an element with safe text. textContent never runs typed text as code.
function h(tag, text, cls) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls;
  return el;
}

// Build the top menu for the current visitor. Returns the logged-in user, or null.
async function setupNav() {
  const nav = document.getElementById("nav");
  nav.textContent = "";
  const link = (text, href) => { const a = h("a", text); a.href = href; nav.appendChild(a); };
  const { user } = await api("/api/me");
  link("Home", "/");
  if (user) {
    link("Dashboard", "/app.html");
    const out = h("button", "Log out");
    out.onclick = async () => { await api("/api/logout", "POST"); location.href = "/"; };
    nav.appendChild(out);
  } else {
    link("Log in", "/login.html");
    link("Sign up", "/signup.html");
  }
  return user;
}
