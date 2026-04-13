#!/usr/bin/env node

process.env.DB_MIGRATION_MODE = "1";
process.env.DB_ALLOW_RUNTIME_DDL = "1";

const { getPool } = require("../netlify/functions/_lib/db");
const { applyRuntimeSettings } = require("../netlify/functions/_lib/runtime-settings");
const { ensureAdminSettingsTable } = require("../netlify/functions/_lib/admin-settings");
const { ensureLearningTables } = require("../netlify/functions/_lib/learning");
const { ensureStudentAuthTables } = require("../netlify/functions/_lib/student-auth");
const { ensureCourseOrdersBatchColumns } = require("../netlify/functions/_lib/course-orders");
const { ensureCourseBatchesTable } = require("../netlify/functions/_lib/batch-store");
const { ensureCouponsTables } = require("../netlify/functions/_lib/coupons");
const { ensureManualPaymentsTable } = require("../netlify/functions/_lib/manual-payments");
const { ensureInstallmentTables } = require("../netlify/functions/_lib/installments");
const { ensureStudentCertificatesTable } = require("../netlify/functions/_lib/student-certificates");
const { ensureAffiliateTables } = require("../netlify/functions/_lib/affiliates");

async function run() {
  const pool = getPool();
  try {
    await ensureAdminSettingsTable(pool);
    await applyRuntimeSettings(pool, { force: true });
    await ensureLearningTables(pool);
    await ensureStudentAuthTables(pool);
    await ensureCourseOrdersBatchColumns(pool);
    await ensureCourseBatchesTable(pool);
    await ensureCouponsTables(pool);
    await ensureManualPaymentsTable(pool);
    await ensureInstallmentTables(pool);
    await ensureStudentCertificatesTable(pool);
    await ensureAffiliateTables(pool);
    console.log("db_migrate_ok");
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error("db_migrate_failed", error && error.message ? error.message : error);
  process.exit(1);
});
