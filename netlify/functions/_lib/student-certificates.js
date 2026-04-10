const { runtimeSchemaChangesAllowed } = require("./schema-mode");

const STUDENT_CERTIFICATES_TABLE = "student_certificates";
let ensured = false;

async function ensureStudentCertificatesTable(pool) {
  if (ensured) return;
  if (!runtimeSchemaChangesAllowed()) {
    ensured = true;
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${STUDENT_CERTIFICATES_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      account_id BIGINT NOT NULL,
      course_slug VARCHAR(120) NOT NULL,
      certificate_no VARCHAR(120) NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'issued',
      issued_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_student_cert_no (certificate_no),
      UNIQUE KEY uniq_student_cert_account_course (account_id, course_slug),
      KEY idx_student_cert_account (account_id, issued_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  ensured = true;
}

module.exports = {
  STUDENT_CERTIFICATES_TABLE,
  ensureStudentCertificatesTable,
};
