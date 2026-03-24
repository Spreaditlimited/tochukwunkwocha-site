const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { ensureCourseBatchesTable, resolveCourseBatch } = require("./_lib/batch-store");
const { DEFAULT_COURSE_SLUG, normalizeCourseSlug, getCourseName, getCourseDefaultAmountMinor } = require("./_lib/course-config");

function formatNaira(minor) {
  const amount = Math.max(0, Number(minor || 0)) / 100;
  const rounded = Math.round(amount);
  return `N${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(rounded)}`;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const qs = event.queryStringParameters || {};
  const courseSlug = normalizeCourseSlug(qs.course_slug, DEFAULT_COURSE_SLUG);
  const batchKey = String(qs.batch_key || "").trim();

  const bankName = String(process.env.MANUAL_BANK_NAME || "").trim();
  const accountName = String(process.env.MANUAL_BANK_ACCOUNT_NAME || "").trim();
  const accountNumber = String(process.env.MANUAL_BANK_ACCOUNT_NUMBER || "").trim();
  const note = String(process.env.MANUAL_BANK_NOTE || "").trim();
  let amountMinor = getCourseDefaultAmountMinor(courseSlug);
  let resolvedBatch = null;

  try {
    const pool = getPool();
    await ensureCourseBatchesTable(pool);
    resolvedBatch = await resolveCourseBatch(pool, { courseSlug, batchKey });
    if (resolvedBatch && Number(resolvedBatch.paystack_amount_minor || 0) > 0) {
      amountMinor = Number(resolvedBatch.paystack_amount_minor);
    }
  } catch (_error) {
    // fall back to configured defaults if batch lookup fails
  }

  return json(200, {
    ok: true,
    courseSlug,
    courseName: getCourseName(courseSlug),
    details: {
      bankName,
      accountName,
      accountNumber,
      note,
      currency: "NGN",
      amountMinor: Math.round(amountMinor),
      amountLabel: formatNaira(amountMinor),
      batchKey: resolvedBatch ? resolvedBatch.batch_key : null,
      batchLabel: resolvedBatch ? resolvedBatch.batch_label : null,
    },
  });
};
