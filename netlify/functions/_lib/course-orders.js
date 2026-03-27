const { applyRuntimeSettings } = require("./runtime-settings");

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (_error) {
    return;
  }
}

async function ensureCourseOrdersBatchColumns(pool) {
  await applyRuntimeSettings(pool);

  await safeAlter(pool, `ALTER TABLE course_orders ADD COLUMN batch_key VARCHAR(64) NULL`);
  await safeAlter(pool, `ALTER TABLE course_orders ADD COLUMN batch_label VARCHAR(120) NULL`);
  await safeAlter(pool, `ALTER TABLE course_orders ADD KEY idx_course_orders_batch_created (batch_key, created_at)`);
  await safeAlter(pool, `ALTER TABLE course_orders ADD COLUMN meta_purchase_sent TINYINT(1) NOT NULL DEFAULT 0`);
  await safeAlter(pool, `ALTER TABLE course_orders ADD COLUMN meta_purchase_sent_at DATETIME NULL`);
  await pool.query(
    `UPDATE course_orders
     SET batch_key = 'ptp-batch-1',
         batch_label = 'Batch 1'
     WHERE course_slug = 'prompt-to-profit'
       AND (batch_key IS NULL OR batch_key = '')`
  );
}

module.exports = { ensureCourseOrdersBatchColumns };
