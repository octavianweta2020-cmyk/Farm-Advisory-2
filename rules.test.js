"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { choices, isSupported } = require("./rules");

test("the listed sample farm requests are supported", () => {
  assert.equal(isSupported({ crop: "Beans", county: "Kakamega", stage: "Planting" }), true);
  assert.equal(isSupported({ crop: "Maize", county: "Nakuru", stage: "Planting" }), true);
});

test("unsupported farm details are not marked for review", () => {
  assert.equal(isSupported({ crop: "Beans", county: "Nakuru", stage: "Planting" }), false);
  assert.equal(isSupported({ crop: "Maize", county: "Nakuru", stage: "Harvest" }), false);
});

test("form choices contain only the values used by the demo rules", () => {
  assert.deepEqual(choices.crops, ["Beans", "Maize"]);
  assert.deepEqual(choices.counties, ["Kakamega", "Nakuru"]);
  assert.ok(choices.stages.includes("Planting"));
});
