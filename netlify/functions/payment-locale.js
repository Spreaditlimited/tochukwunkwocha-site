const { json } = require("./_lib/http");

function firstHeader(headers, names) {
  const src = headers && typeof headers === "object" ? headers : {};
  for (const name of names) {
    const direct = src[name];
    if (direct) return String(direct);
    const lower = src[String(name).toLowerCase()];
    if (lower) return String(lower);
  }
  return "";
}

function countryName(code) {
  const c = String(code || "").trim().toUpperCase();
  if (c === "NG") return "Nigeria";
  if (c === "GB" || c === "UK") return "United Kingdom";
  if (c === "US") return "United States";
  const eu = new Set(["AT","BE","CY","EE","FI","FR","DE","GR","IE","IT","LV","LT","LU","MT","NL","PT","SK","SI","ES"]);
  if (eu.has(c)) return "European Union";
  return "";
}

exports.handler = async function (event) {
  const code = firstHeader(event.headers || {}, [
    "x-nf-country",
    "x-country-code",
    "cloudfront-viewer-country",
    "cf-ipcountry",
  ]);
  return json(200, {
    ok: true,
    countryCode: String(code || "").trim().toUpperCase(),
    country: countryName(code) || "",
  });
};
