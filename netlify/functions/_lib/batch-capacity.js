const { normalizeBatchKey, ensureCourseBatchesTable, getCourseBatchByKey } = require("./batch-store");
const { normalizeCourseSlug, DEFAULT_COURSE_SLUG } = require("./course-config");

async function ensureBatchSeatLimitColumn(pool) {
  await ensureCourseBatchesTable(pool);
  try {
    await pool.query(`ALTER TABLE course_batches ADD COLUMN seat_limit INT NULL`);
  } catch (_error) {
    return;
  }
}

async function countEnrolledForBatch(db, courseSlug, batchKey) {
  const [rows] = await db.query(
    `SELECT (
        COALESCE((
          SELECT COUNT(*)
          FROM course_orders
          WHERE course_slug = ?
            AND batch_key = ?
            AND status = 'paid'
        ), 0)
        +
        COALESCE((
          SELECT COUNT(*)
          FROM course_manual_payments
          WHERE course_slug = ?
            AND batch_key = ?
            AND status = 'approved'
        ), 0)
      ) AS enrolled_count`,
    [courseSlug, batchKey, courseSlug, batchKey]
  );
  return Number(rows && rows[0] && rows[0].enrolled_count ? rows[0].enrolled_count : 0);
}

function parsePositiveInt(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}

function parseNonNegativeInt(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed);
}

async function getBatchCapacity(db, { courseSlug, batchKey }) {
  const slug = normalizeCourseSlug(courseSlug, DEFAULT_COURSE_SLUG);
  const key = normalizeBatchKey(batchKey);
  if (!key) return null;

  await ensureBatchSeatLimitColumn(db);
  const batch = await getCourseBatchByKey(db, slug, key);
  if (!batch) return null;

  const seatLimit = parsePositiveInt(batch.seat_limit);
  const enrolledCount = parseNonNegativeInt(await countEnrolledForBatch(db, slug, key));
  const remainingSeats = seatLimit === null ? null : Math.max(0, seatLimit - enrolledCount);
  const isFull = seatLimit !== null && remainingSeats <= 0;
  return {
    batch,
    seatLimit,
    enrolledCount,
    remainingSeats,
    isFull,
  };
}

async function assertBatchHasCapacity(db, { courseSlug, batchKey }) {
  const capacity = await getBatchCapacity(db, { courseSlug, batchKey });
  if (!capacity) throw new Error("Batch not found");
  if (capacity.isFull) {
    throw new Error(`Sorry, ${capacity.batch.batch_label || "this batch"} is full. Please choose another batch.`);
  }
  return capacity;
}

module.exports = {
  ensureBatchSeatLimitColumn,
  getBatchCapacity,
  assertBatchHasCapacity,
};
