// rules.js: the demo knowledge base and the rule engine (checks R1 to R6 from the proposal).
// All data is FICTIONAL. Real rules need expert review and an approved source.

const reference = {
  crops: ["Beans", "Maize", "Tea", "Potatoes", "Coffee"],
  soils: ["Loam", "Clay", "Sandy"],
  stages: ["Land preparation", "Planting", "Vegetative growth", "Flowering/fruiting", "Harvest"],
  // A county can have several zones, so the farmer must choose the zone.
  zonesByCounty: {
    "Kakamega": ["Upper Midland", "Lower Midland"],
    "Nakuru": ["Lower Highland", "Upper Highland"],
    "Machakos": ["Upper Midland", "Lower Midland"]
  }
};

const rules = [
  { id: "RULE-001", version: 1, crop: "Beans",    county: "Kakamega", zone: "Upper Midland",  soil: "Loam", stage: "Planting",          source: "DEMO-SRC-01", validUntil: "2030-12-31" },
  { id: "RULE-002", version: 1, crop: "Maize",    county: "Nakuru",   zone: "Lower Highland", soil: "Loam", stage: "Planting",          source: "DEMO-SRC-02", validUntil: "2030-12-31" },
  { id: "RULE-003", version: 1, crop: "Tea",      county: "Nakuru",   zone: "Upper Highland", soil: "Loam", stage: "Harvest",           source: "DEMO-SRC-03", validUntil: "2026-01-31" }, // expired on purpose
  { id: "RULE-004", version: 1, crop: "Potatoes", county: "Nakuru",   zone: "Upper Highland", soil: "Loam", stage: "Vegetative growth", source: "DEMO-SRC-04", validUntil: "2030-12-31" },
  { id: "RULE-005", version: 1, crop: "Potatoes", county: "Nakuru",   zone: "Upper Highland", soil: "Loam", stage: "Vegetative growth", source: "DEMO-SRC-05", validUntil: "2030-12-31" }  // clashes with 004 on purpose
];

const PLACEHOLDER = "[Demo placeholder: approved action text goes here]";
const checkNames = [
  "R1 Consent given",
  "R2 All required fields chosen",
  "R3 Matching rule has a valid, unexpired source",
  "R4 A rule covers this combination",
  "R5 Rules do not conflict",
  "R6 Exactly one rule matches"
];

const today = () => new Date().toISOString().slice(0, 10);
const isValid = rule => rule.validUntil >= today();            // ISO dates compare correctly as text
const findRule = id => rules.find(r => r.id === id);
const fits = (r, c) => r.crop === c.crop && r.county === c.county && r.zone === c.zone && r.soil === c.soil && r.stage === c.stage;

// Runs the six checks in order and stops at the first failure.
// Returns { trace, matched, reason }. Each check returns null (pass) or a plain-language reason (fail).
function runEngine(ctx, consent) {
  let matched = null;
  const live = () => rules.filter(r => fits(r, ctx) && isValid(r));
  const checks = [
    () => consent ? null : "Consent is missing, so nothing can be processed.",
    () => {
      const missing = ["crop", "county", "zone", "soil", "stage"].filter(k => !ctx[k]);
      return missing.length ? "Please choose: " + missing.join(", ") + "." : null;
    },
    () => {
      const all = rules.filter(r => fits(r, ctx));
      return all.length && !live().length ? "The matching rule (" + all[0].id + ") passed its review date on " + all[0].validUntil + "." : null;
    },
    () => live().length ? null : "No approved rule covers this combination yet. Please ask an extension officer.",
    () => live().length > 1 ? "Two approved rules match but may disagree, so nothing is shown until an expert resolves it." : null,
    () => { matched = live()[0]; return null; }
  ];
  const trace = [];
  let reason = null;
  checks.forEach((check, i) => {
    if (reason) return trace.push({ name: checkNames[i], status: "skipped", note: "Not reached" });
    const why = check();
    if (why) { reason = why; trace.push({ name: checkNames[i], status: "failed", note: why }); }
    else trace.push({ name: checkNames[i], status: "passed", note: "Passed" });
  });
  return { trace, matched: reason ? null : matched, reason };
}

// The message template from the proposal (Table B.2).
function adviceText(ctx, rule) {
  return `${ctx.crop}, ${ctx.stage}: ${PLACEHOLDER}. Applies to ${ctx.zone}, ${ctx.soil} soil. ` +
         `Source: ${rule.source} (valid until ${rule.validUntil}). If your field differs, contact your extension officer.`;
}

module.exports = { reference, findRule, isValid, runEngine, adviceText };
