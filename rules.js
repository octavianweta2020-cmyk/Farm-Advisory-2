"use strict";

const choices = {
  crops: ["Beans", "Maize"],
  counties: ["Kakamega", "Nakuru"],
  stages: ["Planting", "Growing", "Harvest"]
};

const supportedCombinations = [
  { crop: "Beans", county: "Kakamega", stage: "Planting" },
  { crop: "Maize", county: "Nakuru", stage: "Planting" }
];

function isSupported(request) {
  return supportedCombinations.some(rule =>
    rule.crop === request.crop &&
    rule.county === request.county &&
    rule.stage === request.stage
  );
}

module.exports = { choices, isSupported };
