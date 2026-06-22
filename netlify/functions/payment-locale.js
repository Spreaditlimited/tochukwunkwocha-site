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

function firstGeoCountryCode(event, context) {
  const geoSources = [
    context && context.geo,
    event && event.geo,
    event && event.requestContext && event.requestContext.geo,
  ];
  for (const geo of geoSources) {
    if (!geo || typeof geo !== "object") continue;
    const direct = geo.countryCode || geo.country_code || geo.country;
    if (typeof direct === "string" && direct.trim()) return direct;
    if (geo.country && typeof geo.country === "object") {
      const nested = geo.country.code || geo.country.isoCode || geo.country.iso_code;
      if (nested) return nested;
    }
  }
  return "";
}

function countryCodeFromHeaderValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.charAt(0) === "{") {
    try {
      const parsed = JSON.parse(raw);
      return firstGeoCountryCode({ geo: parsed }, { geo: parsed });
    } catch (error) {
      return "";
    }
  }
  return raw;
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

exports.handler = async function (event, context) {
  const headerCode = firstHeader(event.headers || {}, [
    "x-nf-geo",
    "x-netlify-geo",
    "x-nf-country",
    "x-nf-country-code",
    "x-vercel-ip-country",
    "x-country-code",
    "x-appengine-country",
    "cloudfront-viewer-country",
    "cf-ipcountry",
  ]);
  const code = firstGeoCountryCode(event, context) || countryCodeFromHeaderValue(headerCode);
  return json(200, {
    ok: true,
    countryCode: String(code || "").trim().toUpperCase(),
    country: countryName(code) || "",
  });
};
