const { getPool } = require("../netlify/functions/_lib/db");

async function main() {
  const pool = getPool();

  const updates = [
    { batchKey: "batch-1", batchLabel: "Batch 1", batchStartAt: "2026-03-23 00:00:00" },
    { batchKey: "batch-2", batchLabel: "Batch 2", batchStartAt: "2026-04-20 00:00:00" },
  ];

  for (const item of updates) {
    const [result] = await pool.query(
      `UPDATE course_batches
       SET batch_start_at = ?, updated_at = NOW()
       WHERE course_slug = 'prompt-to-profit'
         AND (
           batch_key = ?
           OR LOWER(TRIM(batch_label)) = LOWER(TRIM(?))
         )`,
      [item.batchStartAt, item.batchKey, item.batchLabel]
    );
    console.log(
      `Updated ${result && Number(result.affectedRows || 0)} row(s) for ${item.batchKey} -> ${item.batchStartAt}`
    );
  }

  const [rows] = await pool.query(
    `SELECT course_slug, batch_key, batch_label,
            DATE_FORMAT(batch_start_at, '%Y-%m-%d %H:%i:%s') AS batch_start_at
     FROM course_batches
     WHERE course_slug = 'prompt-to-profit'
       AND batch_key IN ('batch-1', 'batch-2')
     ORDER BY batch_key ASC`
  );
  console.log("Verification rows:");
  console.log(JSON.stringify(rows, null, 2));
}

main()
  .then(function () {
    process.exit(0);
  })
  .catch(function (error) {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  });
