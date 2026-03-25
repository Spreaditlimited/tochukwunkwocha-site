const DEFAULT_ENROL_SEGMENT_ID = "69ad9a50568c36094377ea96";
const DEFAULT_PRE_ENROL_SEGMENT_ID = "69ad60e952e4ac8ca746bb53";
const { normalizeCourseSlug, DEFAULT_COURSE_SLUG } = require("./course-config");

async function syncFlodeskSubscriberToSegment({ firstName, email, segmentId }) {
  const apiKey = process.env.FLODESK_API_KEY && process.env.FLODESK_API_KEY.trim();
  if (!apiKey) {
    return { ok: false, error: "Missing FLODESK_API_KEY" };
  }

  const segment = String(segmentId || "").trim();
  if (!segment) {
    return { ok: false, error: "Missing segmentId" };
  }

  const payload = {
    email: String(email || "").trim().toLowerCase(),
    first_name: String(firstName || "").trim() || undefined,
    segment_ids: [segment],
    double_optin: false,
  };

  const auth = Buffer.from(`${apiKey}:`).toString("base64");

  try {
    const res = await fetch("https://api.flodesk.com/v1/subscribers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
        "User-Agent": "tochukwunkwocha.com",
      },
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const message = (json && (json.message || json.error)) || `Flodesk error ${res.status}`;
      return { ok: false, error: message };
    }

    return { ok: true, data: json };
  } catch (_error) {
    return { ok: false, error: "Could not reach Flodesk" };
  }
}

function getMainEnrolSegmentId(rawCourseSlug) {
  const courseSlug = normalizeCourseSlug(rawCourseSlug, DEFAULT_COURSE_SLUG);
  if (courseSlug === "prompt-to-production") {
    return (
      (process.env.FLODESK_ENROL_PROD_SEGMENT_ID && process.env.FLODESK_ENROL_PROD_SEGMENT_ID.trim()) ||
      (process.env.FLODESK_ENROL_SEGMENT_ID && process.env.FLODESK_ENROL_SEGMENT_ID.trim()) ||
      DEFAULT_ENROL_SEGMENT_ID
    );
  }
  return (
    (process.env.FLODESK_ENROL_SEGMENT_ID && process.env.FLODESK_ENROL_SEGMENT_ID.trim()) || DEFAULT_ENROL_SEGMENT_ID
  );
}

async function syncFlodeskSubscriber({ firstName, email, courseSlug }) {
  const segmentId = getMainEnrolSegmentId(courseSlug);

  return syncFlodeskSubscriberToSegment({ firstName, email, segmentId });
}

async function syncFlodeskPreEnrolSubscriber({ firstName, email }) {
  const segmentId =
    (process.env.FLODESK_PRE_ENROL_SEGMENT_ID && process.env.FLODESK_PRE_ENROL_SEGMENT_ID.trim()) ||
    DEFAULT_PRE_ENROL_SEGMENT_ID;

  return syncFlodeskSubscriberToSegment({ firstName, email, segmentId });
}

module.exports = {
  syncFlodeskSubscriber,
  syncFlodeskPreEnrolSubscriber,
  syncFlodeskSubscriberToSegment,
  getMainEnrolSegmentId,
  DEFAULT_ENROL_SEGMENT_ID,
  DEFAULT_PRE_ENROL_SEGMENT_ID,
};
