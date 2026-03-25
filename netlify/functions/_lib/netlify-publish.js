function required(name) {
  const value = process.env[name] && String(process.env[name]).trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

async function triggerNetlifyPublish(input) {
  const source = input && typeof input === "object" ? input : {};
  const token = clean(source.apiToken, 400) || required("NETLIFY_API_TOKEN");
  const siteId = clean(source.siteId, 200) || required("NETLIFY_SITE_ID");

  const res = await fetch(`https://api.netlify.com/api/v1/sites/${encodeURIComponent(siteId)}/builds`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !json.id) {
    throw new Error((json && json.message) || `Could not trigger Netlify publish (${res.status})`);
  }

  return {
    buildId: String(json.id),
    deployUrl: String(json.deploy_ssl_url || json.deploy_url || "").trim(),
  };
}

module.exports = { triggerNetlifyPublish };
