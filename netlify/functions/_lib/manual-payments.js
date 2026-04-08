const crypto = require("crypto");
const { nowSql } = require("./db");
const { listCourseBatches, getCourseBatchByKey, normalizeBatchKey, ensureCourseBatchesTable } = require("./batch-store");
const { DEFAULT_COURSE_SLUG, normalizeCourseSlug, getCourseName } = require("./course-config");
const { ensureLearningTables, ensureCourseSlugForeignKey } = require("./learning");

const STATUS_PENDING = "pending_verification";
const STATUS_APPROVED = "approved";
const STATUS_REJECTED = "rejected";

function buildPaymentUuid() {
  return `mp_${crypto.randomUUID().replace(/-/g, "")}`;
}

async function ensureManualPaymentsTable(pool) {
  await ensureLearningTables(pool);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS course_manual_payments (
      id BIGINT NOT NULL AUTO_INCREMENT,
      payment_uuid VARCHAR(64) NOT NULL,
      course_slug VARCHAR(120) NOT NULL,
      first_name VARCHAR(160) NOT NULL,
      email VARCHAR(190) NOT NULL,
      country VARCHAR(120) NULL,
      currency VARCHAR(12) NOT NULL DEFAULT 'NGN',
      amount_minor INT NOT NULL,
      base_amount_minor INT NULL,
      discount_minor INT NULL,
      final_amount_minor INT NULL,
      coupon_code VARCHAR(40) NULL,
      coupon_id BIGINT NULL,
      transfer_reference VARCHAR(190) NULL,
      proof_url TEXT NOT NULL,
      proof_public_id VARCHAR(255) NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending_verification',
      flodesk_pre_synced TINYINT(1) NOT NULL DEFAULT 0,
      flodesk_main_synced TINYINT(1) NOT NULL DEFAULT 0,
      meta_purchase_sent TINYINT(1) NOT NULL DEFAULT 0,
      meta_purchase_sent_at DATETIME NULL,
      reviewed_by VARCHAR(160) NULL,
      review_note VARCHAR(500) NULL,
      reviewed_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_manual_payment_uuid (payment_uuid),
      KEY idx_manual_payment_status_created (status, created_at),
      KEY idx_manual_payment_email (email),
      KEY idx_manual_payment_course (course_slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`ALTER TABLE course_manual_payments MODIFY transfer_reference VARCHAR(190) NULL`);
  try {
    await pool.query(`ALTER TABLE course_manual_payments ADD COLUMN batch_key VARCHAR(64) NULL`);
  } catch (_error) {
    // no-op
  }
  try {
    await pool.query(`ALTER TABLE course_manual_payments ADD COLUMN batch_label VARCHAR(120) NULL`);
  } catch (_error) {
    // no-op
  }
  try {
    await pool.query(`ALTER TABLE course_manual_payments ADD COLUMN meta_purchase_sent TINYINT(1) NOT NULL DEFAULT 0`);
  } catch (_error) {
    // no-op
  }
  try {
    await pool.query(`ALTER TABLE course_manual_payments ADD COLUMN meta_purchase_sent_at DATETIME NULL`);
  } catch (_error) {
    // no-op
  }
  try {
    await pool.query(`ALTER TABLE course_manual_payments ADD KEY idx_manual_payment_batch_created (batch_key, created_at)`);
  } catch (_error) {
    // no-op
  }
  try {
    await pool.query(`ALTER TABLE course_manual_payments ADD COLUMN base_amount_minor INT NULL`);
  } catch (_error) {
    // no-op
  }
  try {
    await pool.query(`ALTER TABLE course_manual_payments ADD COLUMN discount_minor INT NULL`);
  } catch (_error) {
    // no-op
  }
  try {
    await pool.query(`ALTER TABLE course_manual_payments ADD COLUMN final_amount_minor INT NULL`);
  } catch (_error) {
    // no-op
  }
  try {
    await pool.query(`ALTER TABLE course_manual_payments ADD COLUMN coupon_code VARCHAR(40) NULL`);
  } catch (_error) {
    // no-op
  }
  try {
    await pool.query(`ALTER TABLE course_manual_payments ADD COLUMN coupon_id BIGINT NULL`);
  } catch (_error) {
    // no-op
  }
  await pool.query(
    `UPDATE course_manual_payments
     SET base_amount_minor = amount_minor
     WHERE base_amount_minor IS NULL`
  );
  await pool.query(
    `UPDATE course_manual_payments
     SET discount_minor = 0
     WHERE discount_minor IS NULL`
  );
  await pool.query(
    `UPDATE course_manual_payments
     SET final_amount_minor = amount_minor
     WHERE final_amount_minor IS NULL`
  );
  await pool.query(
    `UPDATE course_manual_payments
     SET batch_key = 'ptp-batch-1',
         batch_label = 'Batch 1'
     WHERE course_slug = 'prompt-to-profit'
       AND (batch_key IS NULL OR batch_key = '')`
  );
  await ensureCourseSlugForeignKey(pool, {
    tableName: "course_manual_payments",
    columnName: "course_slug",
    constraintName: "fk_manual_payments_learning_course_slug",
  });
}

async function createManualPayment(pool, input) {
  const paymentUuid = buildPaymentUuid();
  const now = nowSql();

  await pool.query(
    `INSERT INTO course_manual_payments
     (payment_uuid, course_slug, batch_key, batch_label, first_name, email, country, currency, amount_minor, base_amount_minor, discount_minor, final_amount_minor, coupon_code, coupon_id, transfer_reference, proof_url, proof_public_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      paymentUuid,
      input.courseSlug,
      input.batchKey || null,
      input.batchLabel || null,
      input.firstName,
      input.email,
      input.country || null,
      input.currency,
      input.amountMinor,
      input.baseAmountMinor !== undefined && input.baseAmountMinor !== null ? input.baseAmountMinor : input.amountMinor,
      input.discountMinor !== undefined && input.discountMinor !== null ? input.discountMinor : 0,
      input.finalAmountMinor !== undefined && input.finalAmountMinor !== null ? input.finalAmountMinor : input.amountMinor,
      input.couponCode || null,
      input.couponId || null,
      input.transferReference || null,
      input.proofUrl,
      input.proofPublicId || null,
      STATUS_PENDING,
      now,
      now,
    ]
  );

  return paymentUuid;
}

async function markPreSynced(pool, paymentUuid) {
  await pool.query(
    `UPDATE course_manual_payments
     SET flodesk_pre_synced = 1,
         updated_at = ?
     WHERE payment_uuid = ?`,
    [nowSql(), paymentUuid]
  );
}

async function markMainSynced(pool, paymentUuid) {
  await pool.query(
    `UPDATE course_manual_payments
     SET flodesk_main_synced = 1,
         updated_at = ?
     WHERE payment_uuid = ?`,
    [nowSql(), paymentUuid]
  );
}

async function findManualPaymentByUuid(pool, paymentUuid) {
  const [rows] = await pool.query(
    `SELECT id,
            payment_uuid,
            course_slug,
            batch_key,
            batch_label,
            first_name,
            email,
            country,
            currency,
            amount_minor,
            base_amount_minor,
            discount_minor,
            final_amount_minor,
            coupon_code,
            coupon_id,
            transfer_reference,
            proof_url,
            proof_public_id,
            status,
            flodesk_pre_synced,
            flodesk_main_synced,
            meta_purchase_sent,
            meta_purchase_sent_at,
            reviewed_by,
            review_note,
            reviewed_at,
            created_at,
            updated_at
     FROM course_manual_payments
     WHERE payment_uuid = ?
     LIMIT 1`,
    [paymentUuid]
  );

  return rows && rows.length ? rows[0] : null;
}

async function listManualPayments(pool, { status, search, limit }) {
  const where = [];
  const params = [];

  if (status) {
    where.push("status = ?");
    params.push(status);
  }

  const q = String(search || "").trim();
  if (q) {
    where.push("(payment_uuid LIKE ? OR first_name LIKE ? OR email LIKE ? OR transfer_reference LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }

  const sql = `
    SELECT payment_uuid,
           course_slug,
           first_name,
           email,
           country,
           currency,
           amount_minor,
           transfer_reference,
           proof_url,
           proof_public_id,
           status,
           flodesk_pre_synced,
           flodesk_main_synced,
           meta_purchase_sent,
           meta_purchase_sent_at,
           reviewed_by,
           review_note,
           reviewed_at,
           created_at,
           updated_at
    FROM course_manual_payments
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY created_at DESC
    LIMIT ?
  `;

  const safeLimit = Math.max(1, Math.min(Number(limit) || 80, 200));
  params.push(safeLimit);

  const [rows] = await pool.query(sql, params);
  return rows || [];
}

async function reviewManualPayment(pool, { paymentUuid, nextStatus, reviewedBy, reviewNote }) {
  const now = nowSql();
  const note = String(reviewNote || "").trim().slice(0, 500);
  const reviewer = String(reviewedBy || "").trim().slice(0, 160);

  const [res] = await pool.query(
    `UPDATE course_manual_payments
     SET status = ?,
         reviewed_by = ?,
         review_note = ?,
         reviewed_at = ?,
         updated_at = ?
     WHERE payment_uuid = ?`,
    [nextStatus, reviewer || null, note || null, now, now, paymentUuid]
  );

  return Number(res && res.affectedRows ? res.affectedRows : 0);
}

function normalizeQueueStatusForOrder(rawStatus) {
  const status = String(rawStatus || "").trim().toLowerCase();
  if (status === "paid") return STATUS_APPROVED;
  return "";
}

async function listPaymentsQueue(pool, { courseSlug, status, search, limit, batchKey }) {
  const desiredCourseSlug = normalizeCourseSlug(courseSlug, DEFAULT_COURSE_SLUG);
  const desiredStatus = String(status || "").trim().toLowerCase();
  const desiredBatchKey = normalizeBatchKey(batchKey || "");
  const q = String(search || "").trim();
  const like = `%${q}%`;
  const safeLimit = Math.max(1, Math.min(Number(limit) || 80, 200));

  let manualSql = `
    SELECT payment_uuid AS payment_uuid,
           course_slug AS course_slug,
           batch_key AS batch_key,
           batch_label AS batch_label,
           first_name AS first_name,
           email AS email,
           country AS country,
           currency AS currency,
           amount_minor AS amount_minor,
           base_amount_minor AS base_amount_minor,
           discount_minor AS discount_minor,
           final_amount_minor AS final_amount_minor,
           coupon_code AS coupon_code,
           coupon_id AS coupon_id,
           transfer_reference AS transfer_reference,
           proof_url AS proof_url,
           proof_public_id AS proof_public_id,
           status AS queue_status,
           flodesk_pre_synced AS flodesk_pre_synced,
           flodesk_main_synced AS flodesk_main_synced,
           reviewed_by AS reviewed_by,
           review_note AS review_note,
           reviewed_at AS reviewed_at,
           created_at AS created_at,
           updated_at AS updated_at
    FROM course_manual_payments
  `;
  const manualParams = [];
  const manualWhere = ["course_slug = ?"];
  manualParams.push(desiredCourseSlug);
  if (desiredStatus && desiredStatus !== "all") {
    manualWhere.push("status = ?");
    manualParams.push(desiredStatus);
  }
  if (desiredBatchKey && desiredBatchKey !== "all") {
    manualWhere.push("batch_key = ?");
    manualParams.push(desiredBatchKey);
  }
  if (q) {
    manualWhere.push("(payment_uuid LIKE ? OR first_name LIKE ? OR email LIKE ? OR transfer_reference LIKE ?)");
    manualParams.push(like, like, like, like);
  }
  if (manualWhere.length) {
    manualSql += ` WHERE ${manualWhere.join(" AND ")}`;
  }
  manualSql += " ORDER BY created_at DESC LIMIT ?";
  manualParams.push(safeLimit);

  const [manualRows] = await pool.query(manualSql, manualParams);

  let orderRows = [];
  const includeApprovedOrders = desiredStatus === "all" || desiredStatus === STATUS_APPROVED || !desiredStatus;
  if (includeApprovedOrders) {
    let orderSql = `
      SELECT order_uuid AS payment_uuid,
             course_slug AS course_slug,
             batch_key AS batch_key,
             batch_label AS batch_label,
             first_name AS first_name,
             email AS email,
             country AS country,
             currency AS currency,
             amount_minor AS amount_minor,
             provider AS provider,
             provider_reference AS transfer_reference,
             status AS order_status,
             created_at AS created_at,
             updated_at AS updated_at
      FROM course_orders
      WHERE course_slug = ?
        AND status = 'paid'
        AND (provider IS NULL OR provider <> 'wallet_installment')
    `;
    const orderParams = [desiredCourseSlug];
    if (desiredBatchKey && desiredBatchKey !== "all") {
      orderSql += " AND batch_key = ?";
      orderParams.push(desiredBatchKey);
    }
    if (q) {
      orderSql += " AND (order_uuid LIKE ? OR first_name LIKE ? OR email LIKE ? OR provider_reference LIKE ?)";
      orderParams.push(like, like, like, like);
    }
    orderSql += " ORDER BY created_at DESC LIMIT ?";
    orderParams.push(safeLimit);
    const [rows] = await pool.query(orderSql, orderParams);
    orderRows = rows || [];
  }


  const manualItems = (manualRows || []).map(function (row) {
    return {
      payment_uuid: row.payment_uuid,
      course_slug: row.course_slug,
      batch_key: row.batch_key,
      batch_label: row.batch_label,
      first_name: row.first_name,
      email: row.email,
      country: row.country,
      currency: row.currency,
      amount_minor: row.amount_minor,
      base_amount_minor: row.base_amount_minor,
      discount_minor: row.discount_minor,
      final_amount_minor: row.final_amount_minor,
      coupon_code: row.coupon_code,
      coupon_id: row.coupon_id,
      transfer_reference: row.transfer_reference,
      proof_url: row.proof_url,
      proof_public_id: row.proof_public_id,
      status: row.queue_status,
      reviewed_by: row.reviewed_by,
      review_note: row.review_note,
      reviewed_at: row.reviewed_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      source: "manual",
      provider_label: "Manual",
      can_review: row.queue_status === STATUS_PENDING,
    };
  });

  const orderItems = (orderRows || []).map(function (row) {
    const provider = String(row.provider || "").toLowerCase();
    const providerLabel = provider === "paypal" ? "PayPal" : provider === "paystack" ? "Paystack" : "Online";
    return {
      payment_uuid: row.payment_uuid,
      course_slug: row.course_slug,
      batch_key: row.batch_key,
      batch_label: row.batch_label,
      first_name: row.first_name,
      email: row.email,
      country: row.country,
      currency: row.currency,
      amount_minor: row.amount_minor,
      transfer_reference: row.transfer_reference,
      proof_url: null,
      proof_public_id: null,
      status: normalizeQueueStatusForOrder(row.order_status),
      reviewed_by: "system",
      review_note: "Auto-approved after successful online payment",
      reviewed_at: row.updated_at || row.created_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      source: provider || "online",
      provider_label: providerLabel,
      can_review: false,
    };
  });

  return manualItems
    .concat(orderItems)
    .sort(function (a, b) {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .slice(0, safeLimit);
}

async function getPaymentsQueueSummary(pool, opts) {
  await ensureCourseBatchesTable(pool);
  const rawCourseSlug = String((opts && opts.courseSlug) || "").trim().toLowerCase();
  const includeAllCourses = rawCourseSlug === "all";
  const courseSlug = includeAllCourses ? "all" : normalizeCourseSlug(rawCourseSlug, DEFAULT_COURSE_SLUG);
  const desiredBatchKey = normalizeBatchKey((opts && opts.batchKey) || "");
  const scopedBatch = !includeAllCourses && desiredBatchKey && desiredBatchKey !== "all" ? desiredBatchKey : "";
  const availableBatches = includeAllCourses ? [] : await listCourseBatches(pool, courseSlug);
  const batchConfig = includeAllCourses || !scopedBatch
    ? null
    : await getCourseBatchByKey(pool, courseSlug, scopedBatch);

  const manualCourseClause = includeAllCourses ? "" : " AND course_slug = ? ";
  const manualBatchClause = scopedBatch ? " AND batch_key = ? " : "";
  const manualCourseParams = includeAllCourses ? [] : [courseSlug];
  const manualBatchParams = scopedBatch ? [scopedBatch] : [];
  const ordersCourseClause = includeAllCourses ? "" : " AND course_slug = ? ";
  const ordersBatchClause = scopedBatch ? " AND batch_key = ? " : "";
  const ordersCourseParams = includeAllCourses ? [] : [courseSlug];
  const ordersBatchParams = scopedBatch ? [scopedBatch] : [];

  const [manualApprovedRows] = await pool.query(
    `SELECT currency, COUNT(*) AS c, COALESCE(SUM(amount_minor), 0) AS t
     FROM course_manual_payments
     WHERE 1=1
       ${manualCourseClause}
       AND status = 'approved'
       ${manualBatchClause}
     GROUP BY currency`,
    manualCourseParams.concat(manualBatchParams)
  );
  const [manualPendingRows] = await pool.query(
    `SELECT COUNT(*) AS c
     FROM course_manual_payments
     WHERE 1=1
       ${manualCourseClause}
       AND status = 'pending_verification'
       ${manualBatchClause}`,
    manualCourseParams.concat(manualBatchParams)
  );
  const [manualAllRows] = await pool.query(
    `SELECT COUNT(*) AS c
     FROM course_manual_payments
     WHERE 1=1
       ${manualCourseClause}
       ${manualBatchClause}`,
    manualCourseParams.concat(manualBatchParams)
  );
  const [paidOrderRows] = await pool.query(
    `SELECT currency, provider, COUNT(*) AS c, COALESCE(SUM(amount_minor), 0) AS t
     FROM course_orders
     WHERE 1=1
       ${ordersCourseClause}
       AND status = 'paid'
       AND (provider IS NULL OR provider <> 'wallet_installment')
       ${ordersBatchClause}
     GROUP BY currency, provider`,
    ordersCourseParams.concat(ordersBatchParams)
  );

  const totalsByCurrency = {};
  const providerCounts = { manual: 0, paystack: 0, paypal: 0 };
  let paidApprovedCount = 0;
  let paidOrderCount = 0;

  (manualApprovedRows || []).forEach(function (row) {
    const currency = String(row.currency || "NGN").toUpperCase();
    const count = Number(row.c || 0);
    const totalMinor = Number(row.t || 0);
    if (!totalsByCurrency[currency]) totalsByCurrency[currency] = 0;
    totalsByCurrency[currency] += totalMinor;
    providerCounts.manual += count;
    paidApprovedCount += count;
  });

  (paidOrderRows || []).forEach(function (row) {
    const currency = String(row.currency || "").toUpperCase();
    const provider = String(row.provider || "").toLowerCase();
    const count = Number(row.c || 0);
    const totalMinor = Number(row.t || 0);
    if (!totalsByCurrency[currency]) totalsByCurrency[currency] = 0;
    totalsByCurrency[currency] += totalMinor;
    if (provider === "paystack") providerCounts.paystack += count;
    if (provider === "paypal") providerCounts.paypal += count;
    paidOrderCount += count;
    paidApprovedCount += count;
  });


  const manualPendingCount = Number(
    manualPendingRows && manualPendingRows[0] && manualPendingRows[0].c ? manualPendingRows[0].c : 0
  );
  const manualAllCount = Number(
    manualAllRows && manualAllRows[0] && manualAllRows[0].c ? manualAllRows[0].c : 0
  );
  const totalRegistrations = manualAllCount + paidOrderCount;

  return {
    courseName: includeAllCourses ? "All Courses" : getCourseName(courseSlug),
    courseSlug,
    batchKey: includeAllCourses ? "all" : (scopedBatch || "all"),
    batchLabel: batchConfig ? batchConfig.batch_label : "All Batches",
    registrationStatus: includeAllCourses
      ? "Mixed"
      : (batchConfig ? (String(batchConfig.status || "").toLowerCase() === "open" ? "Open" : "Closed") : "Mixed"),
    totalStudents: paidApprovedCount,
    totalRegistrations,
    paidApprovedCount,
    totalsByCurrency,
    providerCounts,
    manualPendingCount,
    availableBatches: (availableBatches || []).map(function (item) {
      return {
        batchKey: item.batch_key,
        batchLabel: item.batch_label,
        status: item.status,
        isActive: Number(item.is_active || 0) === 1,
        batchStartAt: item.batch_start_at || null,
        paystackReferencePrefix: item.paystack_reference_prefix || "",
        paystackAmountMinor: Number(item.paystack_amount_minor || 0),
        paypalAmountMinor: Number(item.paypal_amount_minor || 0),
      };
    }),
  };
}

module.exports = {
  STATUS_PENDING,
  STATUS_APPROVED,
  STATUS_REJECTED,
  ensureManualPaymentsTable,
  createManualPayment,
  markPreSynced,
  markMainSynced,
  findManualPaymentByUuid,
  listManualPayments,
  listPaymentsQueue,
  getPaymentsQueueSummary,
  reviewManualPayment,
};
