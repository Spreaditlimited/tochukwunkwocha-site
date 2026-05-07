#!/usr/bin/env node
const { getPool } = require("../netlify/functions/_lib/db");
const { ensureCourseBatchesTable } = require("../netlify/functions/_lib/batch-store");
const { ensureBatchSeatLimitColumn } = require("../netlify/functions/_lib/batch-capacity");

async function upsertBatch(pool, input) {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  await pool.query(
    `INSERT INTO course_batches
      (course_slug, batch_key, batch_label, status, is_active, paystack_reference_prefix, paystack_amount_minor, paypal_amount_minor, brevo_list_id, seat_limit, created_at, updated_at)
     VALUES (?, ?, ?, 'open', 0, 'PTPH', 1075000, 2400, ?, 500, ?, ?)
     ON DUPLICATE KEY UPDATE
      batch_label = VALUES(batch_label),
      status = 'open',
      brevo_list_id = VALUES(brevo_list_id),
      seat_limit = 500,
      updated_at = VALUES(updated_at)`,
    [input.courseSlug, input.batchKey, input.batchLabel, String(input.brevoListId), now, now]
  );
}

async function main() {
  const pool = getPool();
  await ensureCourseBatchesTable(pool);
  await ensureBatchSeatLimitColumn(pool);
  const courseSlug = "prompt-to-profit-holiday";
  const batches = [
    { batchKey: "ptph-batch-1", batchLabel: "Batch 1", brevoListId: 11 },
    { batchKey: "ptph-batch-2", batchLabel: "Batch 2", brevoListId: 12 },
    { batchKey: "ptph-batch-3", batchLabel: "Batch 3", brevoListId: 13 },
    { batchKey: "ptph-batch-4", batchLabel: "Batch 4", brevoListId: 14 },
  ];

  for (const item of batches) {
    await upsertBatch(pool, {
      courseSlug,
      batchKey: item.batchKey,
      batchLabel: item.batchLabel,
      brevoListId: item.brevoListId,
    });
  }
  console.log("Holiday batches configured:", batches.map((b) => `${b.batchLabel}->${b.brevoListId}`).join(", "));
  process.exit(0);
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
