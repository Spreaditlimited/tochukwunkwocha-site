const { nowSql } = require("./db");
const { ensureCourseOrdersBatchColumns } = require("./course-orders");
const { ensureCourseBatchesTable, getCourseBatchByKey, normalizeBatchKey } = require("./batch-store");
const { getBatchCapacity } = require("./batch-capacity");
const { ensureFamilyTables } = require("./families");
const { syncBrevoSubscriber, removeBrevoSubscriberFromList } = require("./brevo");
const { normalizeCourseSlug, DEFAULT_COURSE_SLUG, getCourseName } = require("./course-config");
const { applyRuntimeSettings } = require("./runtime-settings");
const { runtimeSchemaChangesAllowed } = require("./schema-mode");

const BATCH_CHANGES_TABLE = "student_batch_changes";

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function normalizeEmail(value) {
  return clean(value, 220).toLowerCase();
}

function parseSqlDateMs(value) {
  const raw = clean(value, 40);
  if (!raw) return NaN;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) {
    const parsed = new Date(raw);
    return Number.isFinite(parsed.getTime()) ? parsed.getTime() : NaN;
  }
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4] || "0") - 1,
    Number(match[5] || "0"),
    Number(match[6] || "0")
  );
}

function futureSqlDate(value, nowMs) {
  const ms = parseSqlDateMs(value);
  return Number.isFinite(ms) && ms > nowMs;
}

function displayBatchDate(value) {
  const ms = parseSqlDateMs(value);
  if (!Number.isFinite(ms)) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Lagos",
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(ms));
  } catch (_error) {
    return clean(value, 40);
  }
}

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (_error) {}
}

async function ensureBatchChangeAuditTable(pool) {
  await applyRuntimeSettings(pool);
  if (!runtimeSchemaChangesAllowed()) return false;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${BATCH_CHANGES_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      account_id BIGINT NULL,
      email VARCHAR(220) NOT NULL,
      course_slug VARCHAR(120) NOT NULL,
      source_type VARCHAR(40) NOT NULL,
      source_id VARCHAR(120) NOT NULL,
      old_batch_key VARCHAR(64) NULL,
      old_batch_label VARCHAR(120) NULL,
      old_batch_start_at DATETIME NULL,
      new_batch_key VARCHAR(64) NOT NULL,
      new_batch_label VARCHAR(120) NOT NULL,
      new_batch_start_at DATETIME NULL,
      seat_count INT NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      KEY idx_student_batch_changes_email (email, course_slug, created_at),
      KEY idx_student_batch_changes_account (account_id, course_slug, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await safeAlter(pool, `ALTER TABLE ${BATCH_CHANGES_TABLE} ADD COLUMN seat_count INT NOT NULL DEFAULT 1`);
  return true;
}

function sourceIdFor(item) {
  if (!item) return "";
  if (item.sourceType === "family") return clean(item.familyId, 40) + ":" + clean(item.batchKey, 64);
  return clean(item.id || item.uuid || item.sourceId, 120);
}

function itemCanSwitch(item, nowMs) {
  if (!item || !item.batchKey) return false;
  if (!futureSqlDate(item.batchStartAt, nowMs)) return false;
  return true;
}

async function loadSwitchableEnrollments(pool, account) {
  const accountId = Number(account && account.id || 0);
  const email = normalizeEmail(account && account.email);
  const out = [];
  await ensureCourseOrdersBatchColumns(pool);
  await ensureFamilyTables(pool);

  const [orders] = await pool.query(
    `SELECT o.id,
            o.order_uuid,
            o.course_slug,
            o.batch_key,
            o.batch_label,
            o.first_name,
            o.email,
            o.phone,
            COALESCE(o.seat_count, 1) AS seat_count,
            b.brevo_list_id AS brevo_list_id,
            DATE_FORMAT(b.batch_start_at, '%Y-%m-%d %H:%i:%s') AS batch_start_at
     FROM course_orders o
     LEFT JOIN course_batches b
       ON b.course_slug COLLATE utf8mb4_general_ci = o.course_slug COLLATE utf8mb4_general_ci
      AND b.batch_key COLLATE utf8mb4_general_ci = o.batch_key COLLATE utf8mb4_general_ci
     WHERE LOWER(o.email) COLLATE utf8mb4_general_ci = ?
       AND o.status = 'paid'
       AND COALESCE(o.buyer_type, 'student') <> 'family'
       AND COALESCE(TRIM(o.batch_key), '') <> ''`,
    [email]
  );
  (orders || []).forEach(function (row) {
    out.push({
      sourceType: "order",
      id: Number(row.id || 0),
      uuid: clean(row.order_uuid, 80),
      courseSlug: normalizeCourseSlug(row.course_slug, DEFAULT_COURSE_SLUG),
      courseName: getCourseName(row.course_slug),
      batchKey: clean(row.batch_key, 64),
      batchLabel: clean(row.batch_label, 120),
      batchStartAt: row.batch_start_at || null,
      brevoListId: clean(row.brevo_list_id, 64),
      seatCount: Math.max(1, Number(row.seat_count || 1)),
      displayName: clean(row.first_name, 180),
      email: normalizeEmail(row.email),
      phone: clean(row.phone, 40),
    });
  });

  const [manuals] = await pool.query(
    `SELECT m.id,
            m.payment_uuid,
            m.course_slug,
            m.batch_key,
            m.batch_label,
            m.first_name,
            m.email,
            m.phone,
            COALESCE(m.seat_count, 1) AS seat_count,
            b.brevo_list_id AS brevo_list_id,
            DATE_FORMAT(b.batch_start_at, '%Y-%m-%d %H:%i:%s') AS batch_start_at
     FROM course_manual_payments m
     LEFT JOIN course_batches b
       ON b.course_slug COLLATE utf8mb4_general_ci = m.course_slug COLLATE utf8mb4_general_ci
      AND b.batch_key COLLATE utf8mb4_general_ci = m.batch_key COLLATE utf8mb4_general_ci
     WHERE LOWER(m.email) COLLATE utf8mb4_general_ci = ?
       AND m.status = 'approved'
       AND COALESCE(m.buyer_type, 'student') <> 'family'
       AND COALESCE(TRIM(m.batch_key), '') <> ''`,
    [email]
  );
  (manuals || []).forEach(function (row) {
    out.push({
      sourceType: "manual_payment",
      id: Number(row.id || 0),
      uuid: clean(row.payment_uuid, 80),
      courseSlug: normalizeCourseSlug(row.course_slug, DEFAULT_COURSE_SLUG),
      courseName: getCourseName(row.course_slug),
      batchKey: clean(row.batch_key, 64),
      batchLabel: clean(row.batch_label, 120),
      batchStartAt: row.batch_start_at || null,
      brevoListId: clean(row.brevo_list_id, 64),
      seatCount: Math.max(1, Number(row.seat_count || 1)),
      displayName: clean(row.first_name, 180),
      email: normalizeEmail(row.email),
      phone: clean(row.phone, 40),
    });
  });

  if (accountId > 0) {
    try {
      const [families] = await pool.query(
        `SELECT f.id AS family_id,
                s.course_slug,
                s.batch_key,
                s.batch_label,
                s.seats_purchased,
                s.seats_consumed,
                b.brevo_list_id AS brevo_list_id,
                DATE_FORMAT(b.batch_start_at, '%Y-%m-%d %H:%i:%s') AS batch_start_at,
                f.parent_name,
                f.parent_email,
                f.parent_phone
         FROM family_accounts f
         JOIN family_seat_balances s ON s.family_id = f.id
         LEFT JOIN course_batches b
           ON b.course_slug COLLATE utf8mb4_general_ci = s.course_slug COLLATE utf8mb4_general_ci
          AND b.batch_key COLLATE utf8mb4_general_ci = s.batch_key COLLATE utf8mb4_general_ci
         WHERE f.parent_account_id = ?
           AND f.status = 'active'
           AND COALESCE(TRIM(s.batch_key), '') <> ''
           AND COALESCE(s.seats_purchased, 0) > 0`,
        [accountId]
      );
      (families || []).forEach(function (row) {
        out.push({
          sourceType: "family",
          familyId: Number(row.family_id || 0),
          courseSlug: normalizeCourseSlug(row.course_slug, DEFAULT_COURSE_SLUG),
          courseName: getCourseName(row.course_slug),
          batchKey: clean(row.batch_key, 64),
          batchLabel: clean(row.batch_label, 120),
          batchStartAt: row.batch_start_at || null,
          brevoListId: clean(row.brevo_list_id, 64),
          seatCount: Math.max(1, Number(row.seats_purchased || 0)),
          seatsUsed: Math.max(0, Number(row.seats_consumed || 0)),
          displayName: clean(row.parent_name, 180),
          email: normalizeEmail(row.parent_email) || email,
          phone: clean(row.parent_phone, 40),
        });
      });
    } catch (_error) {}
  }
  return out;
}

async function targetOptionsForEnrollment(pool, item, nowMs) {
  if (!itemCanSwitch(item, nowMs)) return [];
  const [rows] = await pool.query(
    `SELECT course_slug,
            batch_key,
            batch_label,
            status,
            is_active,
            DATE_FORMAT(batch_start_at, '%Y-%m-%d %H:%i:%s') AS batch_start_at,
            seat_limit,
            brevo_list_id
     FROM course_batches
     WHERE course_slug = ?
       AND status = 'open'
       AND COALESCE(TRIM(batch_key), '') <> ''
       AND batch_key <> ?
       AND batch_start_at IS NOT NULL
       AND batch_start_at > NOW()
     ORDER BY batch_start_at ASC, batch_label ASC`,
    [item.courseSlug, item.batchKey]
  );
  const options = [];
  for (const row of rows || []) {
    const capacity = await getBatchCapacity(pool, { courseSlug: item.courseSlug, batchKey: row.batch_key });
    const remaining = capacity && capacity.remainingSeats !== null ? Number(capacity.remainingSeats) : null;
    if (remaining !== null && remaining < Math.max(1, Number(item.seatCount || 1))) continue;
    options.push({
      batchKey: clean(row.batch_key, 64),
      batchLabel: clean(row.batch_label, 120),
      batchStartAt: row.batch_start_at || null,
      batchStartText: displayBatchDate(row.batch_start_at),
      remainingSeats: remaining,
      seatLimit: capacity ? capacity.seatLimit : null,
    });
  }
  return options;
}

async function getBatchSwitchOptions(pool, account) {
  await applyRuntimeSettings(pool).catch(function () {});
  await ensureCourseBatchesTable(pool);
  const nowMs = Date.now();
  const items = await loadSwitchableEnrollments(pool, account);
  const enrollments = [];
  for (const item of items) {
    const options = await targetOptionsForEnrollment(pool, item, nowMs);
    enrollments.push({
      sourceType: item.sourceType,
      sourceId: sourceIdFor(item),
      courseSlug: item.courseSlug,
      courseName: item.courseName,
      batchKey: item.batchKey,
      batchLabel: item.batchLabel,
      batchStartAt: item.batchStartAt,
      batchStartText: displayBatchDate(item.batchStartAt),
      seatCount: item.seatCount,
      seatsUsed: item.seatsUsed,
      canSwitch: itemCanSwitch(item, nowMs) && options.length > 0,
      lockedReason: itemCanSwitch(item, nowMs)
        ? (options.length ? "" : "No future open batch is currently available.")
        : "This batch has already started or has no start date.",
      options,
    });
  }
  return enrollments;
}

function findEnrollment(items, sourceType, sourceId) {
  const type = clean(sourceType, 40).toLowerCase();
  const id = clean(sourceId, 120);
  return (items || []).find(function (item) {
    return clean(item.sourceType, 40).toLowerCase() === type && sourceIdFor(item) === id;
  }) || null;
}

async function syncMovedSubscriber(pool, item, targetBatch) {
  const oldListId = clean(item && item.brevoListId, 64);
  const newListId = clean(targetBatch && targetBatch.brevo_list_id, 64);
  const removed = oldListId && oldListId !== newListId
    ? await removeBrevoSubscriberFromList({
        email: item.email,
        listId: oldListId,
      }).catch(function (error) {
        return { ok: false, error: error && error.message ? error.message : "Brevo removal failed" };
      })
    : { ok: true, skipped: true };
  if (!newListId) {
    return { ok: false, removed, added: { ok: false, skipped: true, error: "Missing listId" } };
  }
  const added = await syncBrevoSubscriber({
    fullName: item.displayName,
    email: item.email,
    phone: item.phone,
    listId: newListId,
    attributes: {
      COURSE: item.courseSlug,
      BATCH: targetBatch.batch_label,
    },
  }).catch(function (error) {
    return { ok: false, error: error && error.message ? error.message : "Brevo sync failed" };
  });
  return {
    ok: !!((removed && (removed.ok || removed.skipped)) && added && added.ok),
    removed,
    added,
  };
}

async function switchEnrollmentBatch(pool, account, input) {
  await applyRuntimeSettings(pool).catch(function () {});
  await ensureCourseBatchesTable(pool);
  await ensureCourseOrdersBatchColumns(pool);
  await ensureFamilyTables(pool);

  const sourceType = clean(input && input.sourceType, 40).toLowerCase();
  const sourceId = clean(input && input.sourceId, 120);
  const targetBatchKey = normalizeBatchKey(input && input.targetBatchKey);
  if (!sourceType || !sourceId || !targetBatchKey) throw new Error("Batch switch details are incomplete.");

  const nowMs = Date.now();
  const items = await loadSwitchableEnrollments(pool, account);
  const item = findEnrollment(items, sourceType, sourceId);
  if (!item) throw new Error("Enrollment not found.");
  if (!itemCanSwitch(item, nowMs)) throw new Error("This batch can no longer be changed.");
  if (targetBatchKey === normalizeBatchKey(item.batchKey)) throw new Error("Choose a different batch.");

  const target = await getCourseBatchByKey(pool, item.courseSlug, targetBatchKey);
  if (!target) throw new Error("Target batch not found.");
  if (clean(target.status, 32).toLowerCase() !== "open") throw new Error("Target batch is not open.");
  if (!futureSqlDate(target.batch_start_at, nowMs)) throw new Error("Target batch has already started.");

  const capacity = await getBatchCapacity(pool, { courseSlug: item.courseSlug, batchKey: targetBatchKey });
  if (capacity && capacity.remainingSeats !== null && Number(capacity.remainingSeats) < Math.max(1, Number(item.seatCount || 1))) {
    throw new Error(`Only ${capacity.remainingSeats} seat${Number(capacity.remainingSeats) === 1 ? "" : "s"} left in ${target.batch_label}.`);
  }

  await ensureBatchChangeAuditTable(pool).catch(function () {
    return false;
  });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const now = nowSql();
    if (item.sourceType === "order") {
      const [result] = await conn.query(
        `UPDATE course_orders
         SET batch_key = ?, batch_label = ?, updated_at = ?
         WHERE id = ?
           AND LOWER(email) COLLATE utf8mb4_general_ci = ?
           AND status = 'paid'
           AND COALESCE(buyer_type, 'student') <> 'family'
           AND batch_key = ?
         LIMIT 1`,
        [target.batch_key, target.batch_label, now, Number(item.id), normalizeEmail(account.email), item.batchKey]
      );
      if (Number(result && result.affectedRows || 0) !== 1) throw new Error("Could not update enrollment batch.");
    } else if (item.sourceType === "manual_payment") {
      const [result] = await conn.query(
        `UPDATE course_manual_payments
         SET batch_key = ?, batch_label = ?, updated_at = ?
         WHERE id = ?
           AND LOWER(email) COLLATE utf8mb4_general_ci = ?
           AND status = 'approved'
           AND COALESCE(buyer_type, 'student') <> 'family'
           AND batch_key = ?
         LIMIT 1`,
        [target.batch_key, target.batch_label, now, Number(item.id), normalizeEmail(account.email), item.batchKey]
      );
      if (Number(result && result.affectedRows || 0) !== 1) throw new Error("Could not update manual enrollment batch.");
    } else if (item.sourceType === "family") {
      const [sourceBalanceRows] = await conn.query(
        `SELECT s.id, s.seats_purchased, s.seats_consumed
         FROM family_seat_balances s
         JOIN family_accounts f ON f.id = s.family_id
         WHERE s.family_id = ?
           AND f.parent_account_id = ?
           AND s.course_slug = ?
           AND s.batch_key = ?
         LIMIT 1
         FOR UPDATE`,
        [Number(item.familyId), Number(account.id), item.courseSlug, item.batchKey]
      );
      const sourceBalance = sourceBalanceRows && sourceBalanceRows[0] ? sourceBalanceRows[0] : null;
      if (!sourceBalance) throw new Error("Could not find group seat balance.");

      const [targetBalanceRows] = await conn.query(
        `SELECT id, seats_purchased, seats_consumed
         FROM family_seat_balances
         WHERE family_id = ?
           AND course_slug = ?
           AND batch_key = ?
         LIMIT 1
         FOR UPDATE`,
        [Number(item.familyId), item.courseSlug, target.batch_key]
      );
      const targetBalance = targetBalanceRows && targetBalanceRows[0] ? targetBalanceRows[0] : null;
      if (targetBalance) {
        await conn.query(
          `UPDATE family_seat_balances
           SET seats_purchased = ?,
               seats_consumed = ?,
               batch_label = ?,
               updated_at = ?
           WHERE id = ?
           LIMIT 1`,
          [
            Number(targetBalance.seats_purchased || 0) + Number(sourceBalance.seats_purchased || 0),
            Number(targetBalance.seats_consumed || 0) + Number(sourceBalance.seats_consumed || 0),
            target.batch_label,
            now,
            Number(targetBalance.id),
          ]
        );
        await conn.query(
          `DELETE FROM family_seat_balances
           WHERE id = ?
           LIMIT 1`,
          [Number(sourceBalance.id)]
        );
      } else {
        const [balanceResult] = await conn.query(
          `UPDATE family_seat_balances
           SET batch_key = ?, batch_label = ?, updated_at = ?
           WHERE id = ?
           LIMIT 1`,
          [target.batch_key, target.batch_label, now, Number(sourceBalance.id)]
        );
        if (Number(balanceResult && balanceResult.affectedRows || 0) !== 1) throw new Error("Could not update group seat batch.");
      }
      await conn.query(
        `UPDATE family_child_enrollments e
         JOIN family_children c ON c.id = e.child_id
         SET e.batch_key = ?, e.batch_label = ?, e.updated_at = ?
         WHERE e.family_id = ?
           AND c.parent_account_id = ?
           AND e.course_slug = ?
           AND e.batch_key = ?
           AND e.status IN ('active', 'pending_payment')`,
        [target.batch_key, target.batch_label, now, Number(item.familyId), Number(account.id), item.courseSlug, item.batchKey]
      );
      await conn.query(
        `UPDATE course_orders
         SET batch_key = ?, batch_label = ?, updated_at = ?
         WHERE (family_account_id = ? OR LOWER(email) COLLATE utf8mb4_general_ci = ?)
           AND course_slug = ?
           AND batch_key = ?
           AND status = 'paid'
           AND COALESCE(buyer_type, 'student') = 'family'`,
        [target.batch_key, target.batch_label, now, Number(item.familyId), normalizeEmail(account.email), item.courseSlug, item.batchKey]
      ).catch(function () {});
      await conn.query(
        `UPDATE course_manual_payments
         SET batch_key = ?, batch_label = ?, updated_at = ?
         WHERE (family_account_id = ? OR LOWER(email) COLLATE utf8mb4_general_ci = ?)
           AND course_slug = ?
           AND batch_key = ?
           AND status = 'approved'
           AND COALESCE(buyer_type, 'student') = 'family'`,
        [target.batch_key, target.batch_label, now, Number(item.familyId), normalizeEmail(account.email), item.courseSlug, item.batchKey]
      ).catch(function () {});
      await conn.query(
        `UPDATE family_seat_ledger
         SET batch_key = ?, updated_at = ?
         WHERE family_id = ?
           AND course_slug = ?
           AND batch_key = ?`,
        [target.batch_key, now, Number(item.familyId), item.courseSlug, item.batchKey]
      ).catch(function () {});
    } else {
      throw new Error("Unsupported enrollment source.");
    }

    await conn.query(
      `INSERT INTO ${BATCH_CHANGES_TABLE}
        (account_id, email, course_slug, source_type, source_id, old_batch_key, old_batch_label, old_batch_start_at, new_batch_key, new_batch_label, new_batch_start_at, seat_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(account.id || 0) || null,
        normalizeEmail(account.email),
        item.courseSlug,
        item.sourceType,
        sourceIdFor(item),
        item.batchKey || null,
        item.batchLabel || null,
        item.batchStartAt || null,
        target.batch_key,
        target.batch_label,
        target.batch_start_at || null,
        Math.max(1, Number(item.seatCount || 1)),
        now,
      ]
    ).catch(function () {});

    await conn.commit();
  } catch (error) {
    try { await conn.rollback(); } catch (_rollbackError) {}
    throw error;
  } finally {
    conn.release();
  }

  const brevo = await syncMovedSubscriber(pool, item, target).catch(function (error) {
    return { ok: false, error: error && error.message ? error.message : "Brevo sync failed" };
  });

  return {
    ok: true,
    courseSlug: item.courseSlug,
    sourceType: item.sourceType,
    sourceId: sourceIdFor(item),
    oldBatch: {
      batchKey: item.batchKey,
      batchLabel: item.batchLabel,
      batchStartAt: item.batchStartAt,
    },
    newBatch: {
      batchKey: target.batch_key,
      batchLabel: target.batch_label,
      batchStartAt: target.batch_start_at || null,
      batchStartText: displayBatchDate(target.batch_start_at),
    },
    brevo,
  };
}

module.exports = {
  getBatchSwitchOptions,
  switchEnrollmentBatch,
};
