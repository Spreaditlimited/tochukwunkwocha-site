const { applyRuntimeSettings } = require("./runtime-settings");
const { ensureLearningTables, ensureCourseSlugForeignKey } = require("./learning");

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (_error) {
    return;
  }
}

async function ensureCourseOrdersBatchColumns(pool) {
  await applyRuntimeSettings(pool);
  await ensureLearningTables(pool);

  await safeAlter(pool, `ALTER TABLE course_orders ADD COLUMN batch_key VARCHAR(64) NULL`);
  await safeAlter(pool, `ALTER TABLE course_orders ADD COLUMN batch_label VARCHAR(120) NULL`);
  await safeAlter(pool, `ALTER TABLE course_orders ADD KEY idx_course_orders_batch_created (batch_key, created_at)`);
  await safeAlter(pool, `ALTER TABLE course_orders ADD COLUMN meta_purchase_sent TINYINT(1) NOT NULL DEFAULT 0`);
  await safeAlter(pool, `ALTER TABLE course_orders ADD COLUMN meta_purchase_sent_at DATETIME NULL`);
  await safeAlter(pool, `ALTER TABLE course_orders ADD COLUMN base_amount_minor INT NULL`);
  await safeAlter(pool, `ALTER TABLE course_orders ADD COLUMN discount_minor INT NOT NULL DEFAULT 0`);
  await safeAlter(pool, `ALTER TABLE course_orders ADD COLUMN final_amount_minor INT NULL`);
  await safeAlter(pool, `ALTER TABLE course_orders ADD COLUMN coupon_code VARCHAR(40) NULL`);
  await safeAlter(pool, `ALTER TABLE course_orders ADD COLUMN coupon_id BIGINT NULL`);
  await safeAlter(pool, `ALTER TABLE course_orders ADD KEY idx_course_orders_coupon_id (coupon_id)`);
  await pool.query(
    `UPDATE course_orders
     SET batch_key = 'ptp-batch-1',
         batch_label = 'Batch 1'
     WHERE course_slug = 'prompt-to-profit'
       AND (batch_key IS NULL OR batch_key = '')`
  );
  await pool.query(
    `UPDATE course_orders
     SET base_amount_minor = amount_minor
     WHERE base_amount_minor IS NULL`
  );
  await pool.query(
    `UPDATE course_orders
     SET final_amount_minor = amount_minor
     WHERE final_amount_minor IS NULL`
  );
  await ensureCourseSlugForeignKey(pool, {
    tableName: "course_orders",
    columnName: "course_slug",
    constraintName: "fk_course_orders_learning_course_slug",
  });
}

module.exports = { ensureCourseOrdersBatchColumns };
