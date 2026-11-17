// dashboard.js: the page you see after logging in. It shows the farmer view or the officer view.
// The server enforces permissions; this file only decides what to display.
const $ = id => document.getElementById(id);
let me = null;                                             // the logged-in user

function showError(err) {
  if (err.status === 401) { location.href = "/login.html"; return; }
  $("error").textContent = err.message;
}

// Fill a dropdown. The first option is a prompt so nothing is chosen by default.
function fillSelect(id, items, prompt) {
  const select = $(id);
  select.textContent = "";
  const first = h("option", prompt); first.value = ""; select.appendChild(first);
  items.forEach(item => select.appendChild(h("option", item)));
}

// The "how was this decided?" list: one line per rule check.
function traceList(trace) {
  const ul = h("ul", undefined, "trace");
  trace.forEach(t => ul.appendChild(h("li", t.name + ": " + t.note, t.status)));
  return ul;
}

// One card per advisory. Officers also get a reason box and Approve/Reject buttons.
function advisoryCard(a, withButtons) {
  const card = h("div", undefined, "card");
  const kind = a.status === "Approved" ? "approved" : a.status === "Pending review" ? "pending" : "stopped";
  const c = a.ctx;
  card.appendChild(h("span", a.status, "tag " + kind));
  card.appendChild(h("p", "#" + a.id + "  " + [c.crop, c.county, c.zone, c.soil + " soil", c.stage].join(" | ")));
  card.appendChild(h("p", a.hidden || a.message || a.note));
  if (a.rule) card.appendChild(h("small", "Rule " + a.rule.id + " v" + a.rule.version + ", source " + a.rule.source + ", valid until " + a.rule.validUntil));
  const details = h("details");
  details.appendChild(h("summary", "How was this decided?"));
  details.appendChild(traceList(a.trace));
  card.appendChild(details);
  if (withButtons) {
    const reason = h("input"); reason.type = "text"; reason.placeholder = "Reason (needed to reject)"; reason.maxLength = 200;
    const approve = h("button", "Approve"); approve.onclick = () => review(a.id, true, "");
    const reject = h("button", "Reject", "reject"); reject.onclick = () => review(a.id, false, reason.value);
    const row = h("div", undefined, "actions");
    row.append(approve, reject);
    card.append(reason, row);
  }
  return card;
}

async function loadList() {
  try {
    const list = await api("/api/advisories");
    const officer = me.role === "officer";
    const box = $(officer ? "queue" : "history");
    box.textContent = "";
    if (!list.length) box.appendChild(h("p", officer ? "Nothing waiting for review." : "No advisories yet."));
    list.forEach(a => box.appendChild(advisoryCard(a, officer)));
  } catch (err) { showError(err); }
}

async function review(id, approve, reason) {
  $("error").textContent = "";
  try { await api("/api/review", "POST", { id, approve, reason }); loadList(); }
  catch (err) { showError(err); }
}

async function startFarmer() {
  $("farmerView").hidden = false;
  const ref = await api("/api/reference");
  fillSelect("crop", ref.crops, "Choose crop");
  fillSelect("county", Object.keys(ref.zonesByCounty), "Choose county");
  fillSelect("zone", [], "Choose a county first");
  fillSelect("soil", ref.soils, "Choose soil");
  fillSelect("stage", ref.stages, "Choose stage");
  $("county").onchange = e => fillSelect("zone", ref.zonesByCounty[e.target.value] || [], "Choose zone");

  $("consent").checked = me.consent;
  $("consent").onchange = async e => {
    try { await api("/api/consent", "POST", { consent: e.target.checked }); loadList(); }
    catch (err) { showError(err); }
  };
  $("adviceForm").onsubmit = async e => {
    e.preventDefault();
    $("error").textContent = "";
    try {
      const a = await api("/api/advice", "POST", Object.fromEntries(new FormData(e.target)));
      $("result").textContent = "";
      $("result").appendChild(advisoryCard(a, false));
      $("result").querySelector("details").open = true;     // show the explanation straight away
      loadList();
    } catch (err) { showError(err); }
  };
  loadList();
}

(async () => {
  try {
    me = await setupNav();
    if (!me) { location.href = "/login.html"; return; }    // not logged in: go to login
    $("welcome").textContent = "Welcome, " + me.name + " (" + me.role + ")";
    if (me.role === "officer") { $("officerView").hidden = false; loadList(); }
    else await startFarmer();
  } catch (err) { showError(err); }
})();
