const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 2000);
}

function configValue(name, fallback, max) {
  const value = clean(process.env[name], max || 300);
  return value || String(fallback || "");
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  try {
    await applyRuntimeSettings(getPool());
  } catch (_error) {}

  return json(200, {
    ok: true,
    trust: {
      trainedValue: configValue("SCHOOLS_TRUST_TRAINED_VALUE", "", 80),
      trainedLabel: configValue("SCHOOLS_TRUST_TRAINED_LABEL", "Learners trained in the first 2 months after launch.", 240),
      reviewsValue: configValue("SCHOOLS_TRUST_REVIEWS_VALUE", "Multiple", 80),
      reviewsLabel: configValue("SCHOOLS_TRUST_REVIEWS_LABEL", "Positive parent and student reviews across early cohorts.", 240),
      outputValue: configValue("SCHOOLS_TRUST_OUTPUT_VALUE", "Real Sites", 80),
      outputLabel: configValue("SCHOOLS_TRUST_OUTPUT_LABEL", "Students are already publishing live websites after training.", 240),
    },
  });
};
