#!/usr/bin/env node

process.env.DB_MIGRATION_MODE = "1";
process.env.DB_ALLOW_RUNTIME_DDL = "1";

const crypto = require("crypto");
const { getPool, nowSql } = require("../netlify/functions/_lib/db");
const { ensureSchoolTables, SCHOOL_STUDENTS_TABLE } = require("../netlify/functions/_lib/schools");

const CODE_LENGTH = 10;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

async function assignCode(pool, row) {
  const schoolId = Number(row.school_id || 0);
  const studentId = Number(row.id || 0);
  if (!schoolId || !studentId) return false;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = makeCode();
    try {
      const [res] = await pool.query(
        `UPDATE ${SCHOOL_STUDENTS_TABLE}
         SET student_code = ?, updated_at = ?
         WHERE id = ? AND school_id = ? AND (student_code IS NULL OR student_code = '')
         LIMIT 1`,
        [code, nowSql(), studentId, schoolId]
      );
      return Number(res && res.affectedRows || 0) > 0;
    } catch (error) {
      const msg = String(error && error.message || "").toLowerCase();
      const codeErr = String(error && error.code || "").toUpperCase();
      const duplicate = codeErr === "ER_DUP_ENTRY" || msg.indexOf("duplicate") !== -1;
      if (duplicate) continue;
      throw error;
    }
  }

  throw new Error(`Could not assign unique code for student ${studentId} in school ${schoolId}`);
}

async function run() {
  const pool = getPool();
  try {
    await ensureSchoolTables(pool);

    const [rows] = await pool.query(
      `SELECT id, school_id
       FROM ${SCHOOL_STUDENTS_TABLE}
       WHERE student_code IS NULL OR student_code = ''
       ORDER BY school_id ASC, id ASC`
    );

    const list = Array.isArray(rows) ? rows : [];
    let updated = 0;

    for (let i = 0; i < list.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await assignCode(pool, list[i]);
      if (ok) updated += 1;
    }

    const [remainingRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM ${SCHOOL_STUDENTS_TABLE}
       WHERE student_code IS NULL OR student_code = ''`
    );
    const remaining = Number(remainingRows && remainingRows[0] && remainingRows[0].total || 0);

    console.log(JSON.stringify({ ok: true, scanned: list.length, updated, remaining }));
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error("school_student_codes_backfill_failed", error && error.message ? error.message : error);
  process.exit(1);
});
