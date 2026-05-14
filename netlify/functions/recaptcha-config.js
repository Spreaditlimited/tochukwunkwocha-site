const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { recaptchaEnabled } = require("./_lib/recaptcha");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  try {
    await applyRuntimeSettings(getPool());
  } catch (_error) {}
  const siteKey = String(process.env.RECAPTCHA_SITE_KEY || "").trim();
  return json(200, {
    ok: true,
    enabled: recaptchaEnabled(),
    siteKey: siteKey || "",
  });
};
