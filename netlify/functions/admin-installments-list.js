const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const { ensureStudentAuthTables } = require("./_lib/student-auth");
const { ensureInstallmentTables } = require("./_lib/installments");
const { ensureCourseBatchesTable, listCourseBatches, normalizeBatchKey } = require("./_lib/batch-store");
const { DEFAULT_COURSE_SLUG, normalizeCourseSlug, getCourseName } = require("./_lib/course-config");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  try {
    await applyRuntimeSettings(getPool());
  } catch (_error) {}

  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  const qs = event.queryStringParameters || {};
  const status = String(qs.status || "all").trim().toLowerCase();
  const search = String(qs.search || "").trim();
  const limit = Math.max(1, Math.min(Number(qs.limit || 100), 300));
  const batchKeyRaw = String(qs.batch_key || "").trim();
  const batchKey = normalizeBatchKey(batchKeyRaw);
  const courseSlug = normalizeCourseSlug(qs.course_slug, DEFAULT_COURSE_SLUG);

  if (!["all", "paid"].includes(status)) {
    return json(400, { ok: false, error: "Invalid status" });
  }

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureInstallmentTables(pool);
    await ensureCourseBatchesTable(pool);

    let sql = `
      SELECT ip.payment_uuid,
             ip.provider,
             ip.provider_reference,
             ip.currency,
             ip.amount_minor,
             ip.status AS payment_status,
             ip.created_at,
             ip.updated_at,
             pl.plan_uuid,
             pl.course_slug,
             pl.batch_key,
             pl.batch_label,
             pl.target_amount_minor,
             pl.total_paid_minor,
             pl.status AS plan_status,
             sa.full_name,
             sa.email
      FROM student_installment_payments ip
      JOIN student_installment_plans pl ON pl.id = ip.plan_id
      LEFT JOIN student_accounts sa ON sa.id = pl.account_id
      WHERE pl.course_slug = ?
        AND ip.status = 'paid'
    `;
    const params = [courseSlug];

    if (batchKey && batchKey !== "all") {
      sql += " AND pl.batch_key = ?";
      params.push(batchKey);
    }
    if (status === "paid") sql += " AND ip.status = 'paid'";
    if (search) {
      const like = `%${search}%`;
      sql += " AND (sa.full_name LIKE ? OR sa.email LIKE ? OR ip.payment_uuid LIKE ? OR ip.provider_reference LIKE ?)";
      params.push(like, like, like, like);
    }
    sql += " ORDER BY ip.created_at DESC LIMIT ?";
    params.push(limit);

    const [rows] = await pool.query(sql, params);

    const [summaryRows] = await pool.query(
      `SELECT ip.status, ip.currency, COUNT(*) AS c, COALESCE(SUM(ip.amount_minor), 0) AS t
       FROM student_installment_payments ip
       JOIN student_installment_plans pl ON pl.id = ip.plan_id
       WHERE pl.course_slug = ?
         AND ip.status = 'paid'
         ${batchKey && batchKey !== "all" ? " AND pl.batch_key = ? " : ""}
       GROUP BY ip.status, ip.currency`,
      [courseSlug].concat(batchKey && batchKey !== "all" ? [batchKey] : [])
    );

    const totalsByCurrency = {};
    let paidCount = 0;
    let pendingCount = 0;
    (summaryRows || []).forEach(function (row) {
      const rowStatus = String(row.status || "").toLowerCase();
      const c = Number(row.c || 0);
      const t = Number(row.t || 0);
      const currency = String(row.currency || "NGN").toUpperCase();
      if (rowStatus === "paid") {
        paidCount += c;
        if (!totalsByCurrency[currency]) totalsByCurrency[currency] = 0;
        totalsByCurrency[currency] += t;
      }
    });

    const [planRows] = await pool.query(
      `SELECT COUNT(*) AS c
       FROM student_installment_plans
       WHERE course_slug = ?
         ${batchKey && batchKey !== "all" ? " AND batch_key = ? " : ""}`,
      [courseSlug].concat(batchKey && batchKey !== "all" ? [batchKey] : [])
    );
    const totalPlans = Number(planRows && planRows[0] ? planRows[0].c : 0);

    const [plansInProgressRows] = await pool.query(
      `SELECT COUNT(*) AS c
       FROM student_installment_plans
       WHERE course_slug = ?
         AND status = 'open'
         AND COALESCE(total_paid_minor, 0) < COALESCE(target_amount_minor, 0)
         ${batchKey && batchKey !== "all" ? " AND batch_key = ? " : ""}`,
      [courseSlug].concat(batchKey && batchKey !== "all" ? [batchKey] : [])
    );
    pendingCount = Number(plansInProgressRows && plansInProgressRows[0] ? plansInProgressRows[0].c : 0);

    const availableBatches = await listCourseBatches(pool, courseSlug);

    return json(200, {
      ok: true,
      items: (rows || []).map(function (row) {
        const paid = String(row.payment_status || "").toLowerCase() === "paid";
        const provider = String(row.provider || "").toLowerCase();
        const providerLabel = provider === "paystack" ? "Paystack" : provider || "Installment";
        return {
          paymentUuid: row.payment_uuid,
          provider: provider,
          providerLabel,
          providerReference: row.provider_reference || "",
          currency: row.currency || "NGN",
          amountMinor: Number(row.amount_minor || 0),
          paymentStatus: paid ? "paid" : "pending",
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          planUuid: row.plan_uuid,
          courseSlug: row.course_slug,
          batchKey: row.batch_key,
          batchLabel: row.batch_label,
          targetAmountMinor: Number(row.target_amount_minor || 0),
          totalPaidMinor: Number(row.total_paid_minor || 0),
          planStatus: row.plan_status || "",
          fullName: row.full_name || "",
          email: row.email || "",
        };
      }),
      summary: {
        courseSlug,
        courseName: getCourseName(courseSlug),
        paidCount,
        pendingCount,
        totalPlans,
        totalsByCurrency,
        availableBatches: (availableBatches || []).map(function (item) {
          return {
            batchKey: item.batch_key,
            batchLabel: item.batch_label,
            isActive: Number(item.is_active || 0) === 1,
          };
        }),
      },
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load installments" });
  }
};
