#!/usr/bin/env node

function clean(value) {
  return String(value || "").trim();
}

function requireEnv(name) {
  var value = clean(process.env[name]);
  if (!value) {
    throw new Error("Missing " + name + ". Export it in your shell before running this script.");
  }
  return value;
}

async function fetchZoomAccessToken() {
  var accountId = requireEnv("ZOOM_ACCOUNT_ID");
  var clientId = requireEnv("ZOOM_CLIENT_ID");
  var clientSecret = requireEnv("ZOOM_CLIENT_SECRET");

  var auth = Buffer.from(clientId + ":" + clientSecret).toString("base64");
  var url = "https://zoom.us/oauth/token?grant_type=account_credentials&account_id=" + encodeURIComponent(accountId);

  var res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + auth,
      Accept: "application/json",
    },
  });

  var json = await res.json().catch(function () {
    return {};
  });

  if (!res.ok || !json.access_token) {
    throw new Error(json.reason || json.message || json.error || ("Zoom token request failed with status " + res.status));
  }

  return json.access_token;
}

async function fetchUserMe(token) {
  var res = await fetch("https://api.zoom.us/v2/users/me", {
    method: "GET",
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/json",
    },
  });

  var json = await res.json().catch(function () {
    return {};
  });

  if (!res.ok) {
    throw new Error(json.reason || json.message || json.error || ("Zoom /users/me failed with status " + res.status));
  }

  return json;
}

(async function main() {
  try {
    var token = await fetchZoomAccessToken();
    var user = await fetchUserMe(token);

    if (!user || !user.id) {
      throw new Error("Zoom returned no user id");
    }

    console.log("ZOOM_HOST_USER_ID=" + String(user.id));
    if (user.email) console.log("Zoom user email: " + String(user.email));
    if (user.display_name) console.log("Zoom display name: " + String(user.display_name));
  } catch (error) {
    console.error("Error:", error && error.message ? error.message : error);
    process.exit(1);
  }
})();
