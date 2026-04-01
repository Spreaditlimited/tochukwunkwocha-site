#!/usr/bin/env node
"use strict";

const http = require("http");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload || {}));
}

function firstEnv(names, max) {
  for (const name of names) {
    const value = clean(process.env[name], max || 500);
    if (value) return value;
  }
  return "";
}

function boolEnv(names, fallback) {
  const raw = firstEnv(names, 20).toLowerCase();
  if (!raw) return Boolean(fallback);
  return raw === "1" || raw === "true" || raw === "yes";
}

const PORT = Number(process.env.PORT || 8080);
const TOKEN = firstEnv(["RESCLUB_PROXY_TOKEN", "PROXY_TOKEN"], 500);
const API_BASE = firstEnv(["RESCLUB_API_BASE_URL", "RESELLERCLUB_API_BASE_URL"], 300)
  || (boolEnv(["RESCLUB_USE_TEST", "RESELLERCLUB_USE_TEST"], true) ? "https://test.httpapi.com" : "https://httpapi.com");
const AUTH_USERID = firstEnv(["RESCLUB_AUTH_USERID", "RESELLERCLUB_RESELLER_ID"], 300);
const API_KEY = firstEnv(["RESCLUB_API_KEY", "RESELLERCLUB_API_KEY"], 500);

if (!AUTH_USERID || !API_KEY) {
  // eslint-disable-next-line no-console
  console.error("Missing RESCLUB_AUTH_USERID/RESELLERCLUB_RESELLER_ID or RESCLUB_API_KEY/RESELLERCLUB_API_KEY");
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "Method not allowed" });

  if (TOKEN) {
    const auth = clean(req.headers.authorization, 600);
    if (auth !== `Bearer ${TOKEN}`) return sendJson(res, 401, { ok: false, error: "Unauthorized" });
  }

  let raw = "";
  req.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > 2_000_000) req.destroy();
  });
  req.on("error", () => sendJson(res, 400, { ok: false, error: "Invalid request body" }));
  req.on("end", async () => {
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch (_error) {
      return sendJson(res, 400, { ok: false, error: "Invalid JSON body" });
    }

    const pathname = clean(body && body.pathname, 200);
    const method = clean(body && body.method, 8).toUpperCase() || "GET";
    const params = (body && body.params && typeof body.params === "object") ? body.params : {};
    if (!pathname || !pathname.startsWith("/api/")) {
      return sendJson(res, 400, { ok: false, error: "Invalid API pathname" });
    }

    const merged = {
      ...params,
      "auth-userid": AUTH_USERID,
      "api-key": API_KEY,
    };
    const qp = new URLSearchParams();
    Object.entries(merged).forEach(([key, value]) => {
      if (Array.isArray(value)) value.forEach((item) => qp.append(key, String(item)));
      else if (value !== undefined && value !== null && String(value) !== "") qp.append(key, String(value));
    });

    const base = API_BASE.replace(/\/+$/, "");
    const url = `${base}${pathname}`;
    const requestUrl = method === "GET" ? `${url}?${qp.toString()}` : url;

    try {
      const upstream = await fetch(requestUrl, {
        method,
        headers: {
          Accept: "application/json",
          ...(method === "GET" ? {} : { "Content-Type": "application/x-www-form-urlencoded" }),
        },
        ...(method === "GET" ? {} : { body: qp.toString() }),
      });
      const text = await upstream.text().catch(() => "");
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch (_error) {
        json = null;
      }
      return sendJson(res, upstream.status, {
        ok: upstream.ok,
        status: upstream.status,
        data: json || {},
      });
    } catch (_error) {
      return sendJson(res, 503, { ok: false, error: "Upstream ResellerClub API unreachable" });
    }
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[resellerclub-proxy] listening on :${PORT}`);
});

