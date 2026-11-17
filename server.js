// server.js: the backend. Uses only Node's built-in modules (nothing to install).
// It serves the pages in /public, keeps users and advisories in data/db.json,
// and exposes a small JSON API under /api. All permission checks happen HERE, not in the browser.
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { reference, findRule, isValid, runEngine, adviceText } = require("./rules");

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");
const DB_FILE = path.join(__dirname, "data", "db.json");
const sessions = new Map();                       // login token -> user id (cleared when the server restarts)

/* ---------- Tiny database (a JSON file) ---------- */
let db;
try { db = JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
catch { db = { users: [], advisories: [], nextId: 1 }; }
const save = () => {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
};

/* ---------- Users and passwords (passwords are hashed, never stored as typed) ---------- */
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString("hex");
function makeUser(name, email, pw, role) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { id: crypto.randomUUID(), name, email, role, salt, hash: hash(pw, salt), consent: false };
}
const passwordOk = (u, pw) => crypto.timingSafeEqual(Buffer.from(hash(pw, u.salt), "hex"), Buffer.from(u.hash, "hex"));

// Officers cannot sign up on the website. One demo officer is created on first run.
if (!db.users.some(u => u.role === "officer")) {
  db.users.push(makeUser("Demo Officer", "officer@demo.local", "Officer123", "officer"));
  save();
}

/* ---------- Helpers ---------- */
const clean = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const send = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
const tokenOf = req => { const m = /(?:^|;\s*)sid=([a-f0-9]+)/.exec(req.headers.cookie || ""); return m ? m[1] : null; };
const userOf = req => { const id = sessions.get(tokenOf(req)); return db.users.find(u => u.id === id); };
function startSession(res, user) {
  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, user.id);
  res.setHeader("Set-Cookie", "sid=" + token + "; HttpOnly; SameSite=Strict; Path=/");
}
// Returns true if allowed; otherwise sends 401 (not logged in) or 403 (wrong role) and returns false.
function need(res, user, role) {
  if (!user) { send(res, 401, { error: "Please log in." }); return false; }
  if (role && user.role !== role) { send(res, 403, { error: "You are not allowed to do that." }); return false; }
  return true;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => { data += chunk; if (data.length > 10000) { reject(new Error("too big")); req.destroy(); } });
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error("bad json")); } });
  });
}
// What the browser is allowed to see about an advisory. Farmers see advice text only after
// approval AND while consent and the rule are still valid (the "release gate").
function view(a, isOfficer) {
  const rule = a.ruleId ? findRule(a.ruleId) : null;
  const out = { id: a.id, ctx: a.ctx, status: a.status, note: a.note, trace: a.trace,
                rule: rule ? { id: rule.id, version: rule.version, source: rule.source, validUntil: rule.validUntil } : null };
  if (rule && isOfficer && a.status === "Pending review") out.message = adviceText(a.ctx, rule);
  if (rule && !isOfficer && a.status === "Approved") {
    const owner = db.users.find(u => u.id === a.userId);
    if (!owner.consent) out.hidden = "Hidden: consent is not given.";
    else if (!isValid(rule)) out.hidden = "Hidden: the rule has expired.";
    else out.message = adviceText(a.ctx, rule);
  }
  return out;
}

/* ---------- The API: one function per route, keyed by "METHOD /path" ---------- */
const api = {
  "GET /api/me": (req, res, user) =>
    send(res, 200, { user: user ? { name: user.name, email: user.email, role: user.role, consent: user.consent } : null }),

  "GET /api/reference": (req, res) => send(res, 200, reference),

  "POST /api/signup": (req, res, user, b) => {
    const name = clean(b.name, 60), email = clean(b.email, 100).toLowerCase(), pw = String(b.password || "");
    if (!name) return send(res, 400, { error: "Please enter your name." });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 400, { error: "Please enter a valid email." });
    if (pw.length < 8 || pw.length > 100) return send(res, 400, { error: "Password must be 8 to 100 characters." });
    if (db.users.some(u => u.email === email)) return send(res, 409, { error: "That email is already registered." });
    const u = makeUser(name, email, pw, "farmer");   // signup always creates a farmer
    db.users.push(u); save(); startSession(res, u);
    send(res, 201, { ok: true });
  },

  "POST /api/login": (req, res, user, b) => {
    const email = clean(b.email, 100).toLowerCase(), pw = String(b.password || "");
    const u = db.users.find(x => x.email === email);
    if (!u || !passwordOk(u, pw)) return send(res, 401, { error: "Wrong email or password." });
    startSession(res, u);
    send(res, 200, { ok: true });
  },

  "POST /api/logout": (req, res) => {
    sessions.delete(tokenOf(req));
    res.setHeader("Set-Cookie", "sid=; Max-Age=0; Path=/");
    send(res, 200, { ok: true });
  },

  "POST /api/consent": (req, res, user, b) => {
    if (!need(res, user, "farmer")) return;
    user.consent = b.consent === true; save();
    send(res, 200, { consent: user.consent });
  },

  "POST /api/advice": (req, res, user, b) => {
    if (!need(res, user, "farmer")) return;
    const ctx = {};
    for (const k of ["crop", "county", "zone", "soil", "stage"]) ctx[k] = clean(b[k], 40);
    const out = runEngine(ctx, user.consent);
    const a = { id: db.nextId++, userId: user.id, ctx, trace: out.trace, ruleId: out.matched ? out.matched.id : null,
                status: out.matched ? "Pending review" : "No advice",
                note: out.reason || "Waiting for an extension officer.", createdAt: new Date().toISOString() };
    db.advisories.push(a); save();
    send(res, 201, view(a, false));
  },

  "GET /api/advisories": (req, res, user) => {
    if (!need(res, user)) return;
    const isOfficer = user.role === "officer";
    const list = isOfficer ? db.advisories.filter(a => a.status === "Pending review")
                           : db.advisories.filter(a => a.userId === user.id);   // farmers see only their own
    send(res, 200, list.slice().reverse().map(a => view(a, isOfficer)));
  },

  "POST /api/review": (req, res, user, b) => {
    if (!need(res, user, "officer")) return;
    const a = db.advisories.find(x => x.id === Number(b.id) && x.status === "Pending review");
    if (!a) return send(res, 404, { error: "Advisory not found or already reviewed." });
    if (b.approve === true) {
      const stillValid = isValid(findRule(a.ruleId));   // re-check before release
      a.status = stillValid ? "Approved" : "Withheld";
      a.note = stillValid ? "Approved by an extension officer." : "The rule expired before approval.";
    } else {
      const reason = clean(b.reason, 200);
      if (!reason) return send(res, 400, { error: "Please give a reason when rejecting." });
      a.status = "Rejected"; a.note = "Rejected: " + reason;
    }
    save();
    send(res, 200, { ok: true });
  }
};

/* ---------- Static files (the website itself) ---------- */
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };
function serveStatic(pathname, res) {
  const file = path.join(PUBLIC, path.normalize(pathname === "/" ? "/index.html" : pathname));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end("Forbidden"); }   // blocks ../ tricks
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": (types[path.extname(file)] || "text/plain") + "; charset=utf-8" });
    res.end(data);
  });
}

/* ---------- The server: sends each request to the API or the static files ---------- */
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/api/")) {
      if (req.method !== "GET") { res.writeHead(405); return res.end("Method not allowed"); }
      return serveStatic(url.pathname, res);
    }
    const handler = api[req.method + " " + url.pathname];
    if (!handler) return send(res, 404, { error: "Not found" });
    if (req.method === "POST" && !(req.headers["content-type"] || "").startsWith("application/json"))
      return send(res, 415, { error: "JSON only" });
    const body = req.method === "POST" ? await readBody(req) : {};
    handler(req, res, userOf(req), body);
  } catch (e) {
    if (!res.headersSent) send(res, 400, { error: "Bad request" });
  }
});
server.on("error", e => console.error("Could not start:", e.message));
server.listen(PORT, () => console.log("Running at http://localhost:" + PORT));
