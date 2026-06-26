const crypto = require("crypto");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 1000);
}

function required(name) {
  const value = clean(process.env[name], 1000);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function signature(params, secret) {
  const payload = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== "")
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return crypto.createHash("sha1").update(`${payload}${secret}`).digest("hex");
}

async function uploadBufferToCloudinary(buffer, options) {
  const cloudName = required("CLOUDINARY_CLOUD_NAME");
  const apiKey = required("CLOUDINARY_API_KEY");
  const apiSecret = required("CLOUDINARY_API_SECRET");
  const opts = options && typeof options === "object" ? options : {};
  const resourceType = clean(opts.resourceType, 40) || "image";
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = clean(opts.publicId, 180);
  const folder = clean(opts.folder, 220);
  const params = {
    folder,
    overwrite: opts.overwrite === false ? "false" : "true",
    public_id: publicId,
    timestamp,
    unique_filename: opts.uniqueFilename === true ? "true" : "false",
    use_filename: opts.useFilename === true ? "true" : "false",
  };
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: clean(opts.contentType, 120) || "application/octet-stream" }), clean(opts.filename, 180) || "upload");
  Object.keys(params).forEach((key) => {
    if (params[key] !== "") form.append(key, String(params[key]));
  });
  form.append("api_key", apiKey);
  form.append("signature", signature(params, apiSecret));

  const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${encodeURIComponent(resourceType)}/upload`, {
    method: "POST",
    body: form,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !json.public_id) {
    throw new Error((json && json.error && json.error.message) || "Cloudinary upload failed");
  }
  return { publicId: json.public_id, secureUrl: json.secure_url };
}

async function destroyCloudinaryAsset(publicId, options) {
  const value = clean(publicId, 500);
  if (!value) return null;
  const opts = options && typeof options === "object" ? options : {};
  const resourceType = clean(opts.resourceType, 40) || "image";
  const cloudName = required("CLOUDINARY_CLOUD_NAME");
  const apiKey = required("CLOUDINARY_API_KEY");
  const apiSecret = required("CLOUDINARY_API_SECRET");
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { public_id: value, timestamp };
  const form = new FormData();
  form.append("public_id", value);
  form.append("timestamp", String(timestamp));
  form.append("api_key", apiKey);
  form.append("signature", signature(params, apiSecret));
  const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${encodeURIComponent(resourceType)}/destroy`, {
    method: "POST",
    body: form,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json && json.error && json.error.message) || "Cloudinary delete failed");
  return json;
}

module.exports = { uploadBufferToCloudinary, destroyCloudinaryAsset };
