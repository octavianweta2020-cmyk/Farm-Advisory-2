"use strict";

const byId = id => document.getElementById(id);
let accountMode = "login";
let currentUser = null;

async function api(url, method = "GET", data) {
  const response = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The request could not be completed.");
  return result;
}

function showMessage(id, text, success = false) {
  const message = byId(id);
  message.textContent = text;
  message.classList.toggle("success", success);
}

function setAccountMode(mode) {
  accountMode = mode;
  const signup = mode === "signup";
  byId("nameField").hidden = !signup;
  byId("nameField").querySelector("input").required = signup;
  byId("consentField").hidden = !signup;
  byId("consentField").querySelector("input").required = signup;
  byId("accountSubmit").textContent = signup ? "Create account" : "Log in";
  byId("accountForm").elements.password.autocomplete = signup ? "new-password" : "current-password";
  byId("loginTab").classList.toggle("active", !signup);
  byId("signupTab").classList.toggle("active", signup);
  byId("loginTab").setAttribute("aria-selected", String(!signup));
  byId("signupTab").setAttribute("aria-selected", String(signup));
  showMessage("accountMessage", "");
}

function addOptions(select, values, placeholder) {
  select.replaceChildren(new Option(placeholder, ""));
  for (const value of values) select.add(new Option(value, value));
}

function requestCard(item, officer = false) {
  const card = document.createElement("article");
  card.className = "request-card";

  const status = document.createElement("span");
  status.className = "status";
  if (item.status === "Approved") status.classList.add("approved");
  if (item.status === "Declined") status.classList.add("declined");
  if (item.status === "Not covered") status.classList.add("not-covered");
  status.textContent = item.status;
  card.append(status);

  const title = document.createElement("h3");
  title.textContent = `${item.crop} · ${item.county} · ${item.stage}`;
  card.append(title);
  if (officer) {
    const farmer = document.createElement("p");
    farmer.textContent = `Farmer: ${item.farmer}`;
    card.append(farmer);
  }
  const note = document.createElement("p");
  note.textContent = item.note;
  card.append(note);
  if (item.advice) {
    const advice = document.createElement("p");
    advice.textContent = `Reviewed advice: ${item.advice}`;
    card.append(advice);
  }

  if (officer) addReviewForm(card, item);
  return card;
}

function addReviewForm(card, item) {
  const form = document.createElement("form");
  form.className = "officer-form";
  const adviceLabel = document.createElement("label");
  adviceLabel.textContent = "Reviewed advice";
  const advice = document.createElement("textarea");
  advice.name = "advice";
  advice.rows = 3;
  advice.maxLength = 1000;
  advice.required = true;
  adviceLabel.append(advice);

  const reasonLabel = document.createElement("label");
  reasonLabel.textContent = "Reason if declining";
  const reason = document.createElement("input");
  reason.name = "reason";
  reason.maxLength = 300;
  reasonLabel.append(reason);

  const approve = document.createElement("button");
  approve.className = "button";
  approve.type = "button";
  approve.textContent = "Approve with advice";
  approve.addEventListener("click", () => reviewRequest(item.id, "approve", advice.value, "", message));

  const decline = document.createElement("button");
  decline.type = "button";
  decline.textContent = "Decline request";
  decline.addEventListener("click", () => reviewRequest(item.id, "reject", "", reason.value, message));

  const message = document.createElement("p");
  message.className = "message";
  message.setAttribute("role", "alert");
  form.append(adviceLabel, reasonLabel, approve, decline, message);
  card.append(form);
}

async function loadRequests() {
  const { requests } = await api("/api/requests");
  const list = currentUser.role === "officer" ? byId("officerRequests") : byId("farmerRequests");
  list.replaceChildren();
  if (!requests.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = currentUser.role === "officer" ? "No requests need review." : "You have not sent a request yet.";
    list.append(empty);
    return;
  }
  for (const item of requests) list.append(requestCard(item, currentUser.role === "officer"));
}

async function reviewRequest(id, action, advice, reason, message) {
  const body = action === "approve" ? { id, action, advice } : { id, action, reason };
  try {
    await api("/api/review", "POST", body);
    await loadRequests();
  } catch (error) {
    message.textContent = error.message;
  }
}

async function showDashboard(user) {
  currentUser = user;
  byId("account").hidden = true;
  byId("welcome").hidden = true;
  byId("dashboard").hidden = false;
  byId("dashboardTitle").textContent = user.role === "officer" ? "Officer review" : `Hello, ${user.name}`;
  byId("accountEmail").textContent = user.email;
  byId("farmerPanel").hidden = user.role !== "farmer";
  byId("officerPanel").hidden = user.role !== "officer";
  byId("navigation").replaceChildren();

  const logout = document.createElement("button");
  logout.type = "button";
  logout.textContent = "Log out";
  logout.addEventListener("click", async () => {
    await api("/api/logout", "POST", {});
    window.location.reload();
  });
  byId("navigation").append(logout);

  if (user.role === "farmer") {
    const choices = await api("/api/choices");
    addOptions(byId("requestForm").elements.crop, choices.crops, "Choose crop");
    addOptions(byId("requestForm").elements.county, choices.counties, "Choose county");
    addOptions(byId("requestForm").elements.stage, choices.stages, "Choose stage");
  }
  await loadRequests();
}

byId("loginTab").addEventListener("click", () => setAccountMode("login"));
byId("signupTab").addEventListener("click", () => setAccountMode("signup"));

byId("accountForm").addEventListener("submit", async event => {
  event.preventDefault();
  showMessage("accountMessage", "");
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const action = accountMode === "signup" ? "/api/signup" : "/api/login";
  try {
    const result = await api(action, "POST", data);
    await showDashboard(result.user);
  } catch (error) {
    showMessage("accountMessage", error.message);
  }
});

byId("requestForm").addEventListener("submit", async event => {
  event.preventDefault();
  showMessage("requestMessage", "");
  const data = Object.fromEntries(new FormData(event.currentTarget));
  try {
    const { request } = await api("/api/requests", "POST", data);
    showMessage("requestMessage", request.note, request.status === "Waiting for review");
    await loadRequests();
  } catch (error) {
    showMessage("requestMessage", error.message);
  }
});

(async function start() {
  try {
    const { user } = await api("/api/session");
    if (user) await showDashboard(user);
  } catch (error) {
    showMessage("accountMessage", error.message);
  }
})();
