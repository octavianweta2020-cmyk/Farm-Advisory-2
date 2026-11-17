"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { choices, isSupported } = require("./rules");

const port = Number(process.env.PORT || 3000);
const publicDirectory = path.join(__dirname, "public");
const dataFile = path.join(__dirname, "data", "db.json");
const sessions = new Map();
const cookieName = "farm_advisory_session";
const officerEmail = process.env.OFFICER_EMAIL || "officer@demo.local";
const officerPassword = process.env.OFFICER_PASSWORD || "Officer123";

function readDatabase() {
  try {
    return JSON.parse(fs.readFileSync(dataFile, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { users: [], requests: [], nextId: 1 };
  }
}

let database = readDatabase();

function saveDatabase() {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(database, null, 2));
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString("hex");
}

function createUser(name, email, password, role) {
  const salt = crypto.randomBytes(16).toString("hex");
  return {
    id: crypto.randomUUID(),
    name,
    email,
    role,
    salt,
    passwordHash: hashPassword(password, salt),
    consent: role === "farmer"
  };
}

if (!database.users.some(user => user.role === "officer")) {
  database.users.push(createUser("Demo Officer", officerEmail, officerPassword, "officer"));
  saveDatabase();
}

function sendJson(response, status, value, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(JSON.stringify(value));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", chunk => {
      body += chunk;
      if (body.length > 16_000) {
        const error = new Error("Request is too large.");
        error.status = 413;
        reject(error);
      }
    });
    request.on("end", () => {
      if (body.length > 16_000) return;
      try {
        const value = body ? JSON.parse(body) : {};
        if (!value || Array.isArray(value) || typeof value !== "object") {
          throw new Error("Please send a JSON object.");
        }
        resolve(value);
      } catch (error) {
        error.status = 400;
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sessionUser(request) {
  const cookie = request.headers.cookie || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${cookieName}=([a-f0-9]+)`));
  const userId = match ? sessions.get(match[1]) : null;
  return database.users.find(user => user.id === userId) || null;
}

function startSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, user.id);
  return `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/`;
}

function publicUser(user) {
  return { name: user.name, email: user.email, role: user.role, consent: user.consent };
}

function requireUser(user, role) {
  if (!user) {
    const error = new Error("Please log in to continue.");
    error.status = 401;
    throw error;
  }
  if (role && user.role !== role) {
    const error = new Error("You do not have permission to do that.");
    error.status = 403;
    throw error;
  }
}

function publicRequest(item) {
  return {
    id: item.id,
    farmer: item.farmer,
    crop: item.crop,
    county: item.county,
    stage: item.stage,
    status: item.status,
    note: item.note,
    advice: item.advice,
    createdAt: item.createdAt
  };
}

async function handleApi(request, response, url) {
  const user = sessionUser(request);
  const key = `${request.method} ${url.pathname}`;

  if (key === "GET /api/session") {
    return sendJson(response, 200, { user: user ? publicUser(user) : null });
  }

  if (key === "GET /api/choices") {
    return sendJson(response, 200, choices);
  }

  if (key === "GET /api/requests") {
    requireUser(user);
    const list = user.role === "officer"
      ? database.requests.filter(item => item.status === "Waiting for review")
      : database.requests.filter(item => item.userId === user.id);
    return sendJson(response, 200, { requests: list.slice().reverse().map(publicRequest) });
  }

  if (request.method !== "POST") {
    return sendJson(response, 404, { error: "Not found." });
  }
  if (!(request.headers["content-type"] || "").startsWith("application/json")) {
    return sendJson(response, 415, { error: "Please send JSON data." });
  }

  const body = await readJson(request);

  if (key === "POST /api/signup") {
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (!name || name.length > 60) throw Object.assign(new Error("Enter your name (up to 60 characters)."), { status: 400 });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120) {
      throw Object.assign(new Error("Enter a valid email address."), { status: 400 });
    }
    if (password.length < 8 || password.length > 100) {
      throw Object.assign(new Error("Password must be 8 to 100 characters."), { status: 400 });
    }
    if (body.consent !== "on") {
      throw Object.assign(new Error("Agree to share your farm request with an officer to create an account."), { status: 400 });
    }
    if (database.users.some(item => item.email === email)) {
      throw Object.assign(new Error("That email already has an account."), { status: 409 });
    }
    const newUser = createUser(name, email, password, "farmer");
    database.users.push(newUser);
    saveDatabase();
    return sendJson(response, 201, { user: publicUser(newUser) }, { "Set-Cookie": startSession(newUser) });
  }

  if (key === "POST /api/login") {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const existing = database.users.find(item => item.email === email);
    const valid = existing && crypto.timingSafeEqual(
      Buffer.from(hashPassword(password, existing.salt), "hex"),
      Buffer.from(existing.passwordHash, "hex")
    );
    if (!valid) throw Object.assign(new Error("Email or password is incorrect."), { status: 401 });
    return sendJson(response, 200, { user: publicUser(existing) }, { "Set-Cookie": startSession(existing) });
  }

  if (key === "POST /api/logout") {
    const cookie = request.headers.cookie || "";
    const match = cookie.match(new RegExp(`(?:^|;\\s*)${cookieName}=([a-f0-9]+)`));
    if (match) sessions.delete(match[1]);
    return sendJson(response, 200, { ok: true }, {
      "Set-Cookie": `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`
    });
  }

  if (key === "POST /api/requests") {
    requireUser(user, "farmer");
    const item = {
      crop: String(body.crop || ""),
      county: String(body.county || ""),
      stage: String(body.stage || "")
    };
    if (!choices.crops.includes(item.crop) ||
        !choices.counties.includes(item.county) ||
        !choices.stages.includes(item.stage)) {
      throw Object.assign(new Error("Choose a crop, county, and farming stage from the lists."), { status: 400 });
    }
    const covered = isSupported(item);
    const farmRequest = {
      id: database.nextId++,
      userId: user.id,
      farmer: user.name,
      ...item,
      status: covered ? "Waiting for review" : "Not covered",
      note: covered
        ? "An extension officer will review your request."
        : "There is no demo guidance for this combination.",
      advice: "",
      createdAt: new Date().toISOString()
    };
    database.requests.push(farmRequest);
    saveDatabase();
    return sendJson(response, 201, { request: publicRequest(farmRequest) });
  }

  if (key === "POST /api/review") {
    requireUser(user, "officer");
    const item = database.requests.find(entry =>
      entry.id === Number(body.id) && entry.status === "Waiting for review"
    );
    if (!item) throw Object.assign(new Error("That request is no longer waiting for review."), { status: 404 });

    if (body.action === "approve") {
      const advice = String(body.advice || "").trim();
      if (!advice || advice.length > 1000) {
        throw Object.assign(new Error("Write advice of up to 1,000 characters before approving."), { status: 400 });
      }
      item.status = "Approved";
      item.advice = advice;
      item.note = "Reviewed by an extension officer.";
    } else if (body.action === "reject") {
      const reason = String(body.reason || "").trim();
      if (!reason || reason.length > 300) {
        throw Object.assign(new Error("Write a reason of up to 300 characters before rejecting."), { status: 400 });
      }
      item.status = "Declined";
      item.note = reason;
    } else {
      throw Object.assign(new Error("Choose approve or reject."), { status: 400 });
    }

    saveDatabase();
    return sendJson(response, 200, { request: publicRequest(item) });
  }

  return sendJson(response, 404, { error: "Not found." });
}

const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]]
]);

async function handleRequest(request, response) {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    return handleApi(request, response, url);
  }
  if (request.method !== "GET") {
    response.writeHead(405, { Allow: "GET" });
    return response.end("Method not allowed.");
  }

  const file = staticFiles.get(url.pathname);
  if (!file) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return response.end("Not found.");
  }
  const content = await fs.promises.readFile(path.join(publicDirectory, file[0]));
  response.writeHead(200, {
    "Content-Type": file[1],
    "X-Content-Type-Options": "nosniff"
  });
  response.end(content);
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch(error => {
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    if (!response.headersSent) {
      sendJson(response, status, {
        error: status >= 500 ? "The server could not complete the request." : error.message
      });
    } else {
      response.destroy(error);
    }
  });
});

server.listen(port, () => {
  console.log(`Farm Advisory is running at http://localhost:${port}`);
  console.log(`Demo officer: ${officerEmail}`);
});
