const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireAdminSession } = require("./_lib/admin-auth");
const { STUDENT_CERTIFICATES_TABLE } = require("./_lib/student-certificates");
const {
  ensureLearningSupportTables,
  listAssignmentsForAdmin,
  normalizeCourseSlug,
} = require("./_lib/learning-support");

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function siteBaseUrl() {
  return clean(process.env.SITE_BASE_URL || "https://tochukwunkwocha.com", 240).replace(/\/$/, "");
}

function isMissingTableError(error) {
  const code = String(error && error.code || "").trim().toUpperCase();
  const msg = String(error && error.message || "").toLowerCase();
  return code === "ER_NO_SUCH_TABLE" || msg.indexOf("doesn't exist") !== -1 || msg.indexOf("does not exist") !== -1;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const courseSlug = normalizeCourseSlug(event.queryStringParameters && event.queryStringParameters.course_slug) || "all";
  const status = clean(event.queryStringParameters && event.queryStringParameters.status, 32).toLowerCase() || "all";
  const search = clean(event.queryStringParameters && event.queryStringParameters.search, 220);

  const pool = getPool();
  try {
    await ensureLearningSupportTables(pool, { bootstrap: true });
    const payload = await listAssignmentsForAdmin(pool, {
      course_slug: courseSlug,
      status,
      search,
      limit: 200,
    });
    const items = Array.isArray(payload.items) ? payload.items : [];
    const accountIds = Array.from(new Set(items.map(function (item) {
      return Number(item && item.account_id || 0);
    }).filter(function (n) {
      return n > 0;
    })));
    const courseSlugs = Array.from(new Set(items.map(function (item) {
      return clean(item && item.course_slug, 120).toLowerCase();
    }).filter(Boolean)));
    const certMap = new Map();
    if (accountIds.length && courseSlugs.length) {
      try {
        const accountPlaceholders = accountIds.map(function () { return "?"; }).join(",");
        const coursePlaceholders = courseSlugs.map(function () { return "?"; }).join(",");
        const [certRows] = await pool.query(
          `SELECT account_id, course_slug, certificate_no
           FROM ${STUDENT_CERTIFICATES_TABLE}
           WHERE status = 'issued'
             AND account_id IN (${accountPlaceholders})
             AND course_slug IN (${coursePlaceholders})`,
          accountIds.concat(courseSlugs)
        );
        (Array.isArray(certRows) ? certRows : []).forEach(function (row) {
          const accountId = Number(row && row.account_id || 0);
          const slug = clean(row && row.course_slug, 120).toLowerCase();
          const certNo = clean(row && row.certificate_no, 140);
          if (!(accountId > 0) || !slug || !certNo) return;
          const key = String(accountId) + "::" + slug;
          certMap.set(key, `${siteBaseUrl()}/dashboard/certificate/?certificate_no=${encodeURIComponent(certNo)}`);
        });
      } catch (error) {
        if (!isMissingTableError(error)) throw error;
      }
    }

    return json(200, {
      ok: true,
      filters: {
        course_slug: courseSlug,
        status,
        search,
      },
      total: Number(payload.total || 0),
      items: items.map(function (item) {
        const accountId = Number(item && item.account_id || 0);
        const slug = clean(item && item.course_slug, 120).toLowerCase();
        const key = String(accountId) + "::" + slug;
        return {
          ...item,
          certificate_url: certMap.get(key) || "",
        };
      }),
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load assignments." });
  }
};
