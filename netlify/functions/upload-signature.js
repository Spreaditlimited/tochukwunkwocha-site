const crypto = require("crypto");
const { json, badMethod } = require("./_lib/http");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || "").trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || "").trim();

  if (!cloudName || !apiKey || !apiSecret) {
    return json(500, { ok: false, error: "Cloudinary not configured" });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "tochukwunkwocha-site/manual-payments";
  const source = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash("sha1").update(source).digest("hex");

  return json(200, {
    ok: true,
    cloudName,
    apiKey,
    timestamp,
    folder,
    signature,
  });
};
