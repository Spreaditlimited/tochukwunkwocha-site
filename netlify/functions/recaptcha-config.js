const { json, badMethod } = require("./_lib/http");
const { recaptchaEnabled } = require("./_lib/recaptcha");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  const siteKey = String(process.env.RECAPTCHA_SITE_KEY || "").trim();
  return json(200, {
    ok: true,
    enabled: recaptchaEnabled(),
    siteKey: siteKey || "",
  });
};

