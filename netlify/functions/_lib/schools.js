const crypto = require("crypto");
const { nowSql } = require("./db");
const { applyRuntimeSettings } = require("./runtime-settings");
const {
  ensureStudentAuthTables,
  findStudentByEmail,
  createStudentAccount,
} = require("./student-auth");
const { MODULES_TABLE, LESSONS_TABLE, ensureLearningTables, ensureCourseSlugForeignKey } = require("./learning");
const LESSON_PROGRESS_TABLE = "tochukwu_learning_lesson_progress";

const SCHOOL_ORDERS_TABLE = "school_orders";
const SCHOOL_ACCOUNTS_TABLE = "school_accounts";
const SCHOOL_ADMINS_TABLE = "school_admins";
const SCHOOL_ADMIN_SESSIONS_TABLE = "school_admin_sessions";
const SCHOOL_STUDENTS_TABLE = "school_students";
const SCHOOL_CERTIFICATES_TABLE = "school_certificates";

const SCHOOL_ADMIN_COOKIE = "tws_school_admin_session";
const SCHOOL_ADMIN_SESSION_MAX_AGE = 60 * 60 * 24 * 30;

const DEFAULT_SCHOOLS_MIN_SEATS = 50;
const DEFAULT_SCHOOLS_PRICE_PER_STUDENT_MINOR = 850000;
const DEFAULT_SITE_VAT_PERCENT = 7.5;

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function normalizeEmail(value) {
  const email = clean(value, 220).toLowerCase();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return ok ? email : "";
}

function normalizeWebsiteUrl(value) {
  const raw = clean(value, 1000);
  if (!raw) return "";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withScheme);
    const protocol = String(parsed.protocol || "").toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") return "";
    return parsed.toString().slice(0, 1000);
  } catch (_error) {
    return "";
  }
}

function toInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Number.isFinite(fallback) ? Math.trunc(fallback) : 0;
  return Math.trunc(n);
}

function vatPercent() {
  const raw = Number(
    process.env.SCHOOLS_VAT_PERCENT ||
      process.env.SITE_VAT_PERCENT ||
      process.env.DOMAIN_VAT_PERCENT ||
      DEFAULT_SITE_VAT_PERCENT
  );
  if (!Number.isFinite(raw) || raw < 0) return DEFAULT_SITE_VAT_PERCENT;
  return raw;
}

function schoolsMinSeats() {
  const raw = Number(process.env.SCHOOLS_MIN_SEATS || DEFAULT_SCHOOLS_MIN_SEATS);
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_SCHOOLS_MIN_SEATS;
  return Math.trunc(raw);
}

function schoolsPricePerStudentMinor() {
  const raw = Number(process.env.SCHOOLS_PRICE_PER_STUDENT_NGN_MINOR || DEFAULT_SCHOOLS_PRICE_PER_STUDENT_MINOR);
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_SCHOOLS_PRICE_PER_STUDENT_MINOR;
  return Math.trunc(raw);
}

function schoolsPricingConfig() {
  const minSeats = schoolsMinSeats();
  const pricePerStudentMinor = schoolsPricePerStudentMinor();
  const vatPct = vatPercent();
  const vatBps = Math.round(vatPct * 100);
  return {
    minSeats,
    pricePerStudentMinor,
    vatPercent: vatPct,
    vatBps,
  };
}

function schoolsPricing(seatCountInput) {
  const cfg = schoolsPricingConfig();
  const seats = Math.max(0, toInt(seatCountInput, 0));
  const pricePerSeatMinor = cfg.pricePerStudentMinor;
  const subtotalMinor = Math.max(0, seats * pricePerSeatMinor);
  const vatBps = cfg.vatBps;
  const vatMinor = Math.round((subtotalMinor * vatBps) / 10000);
  const totalMinor = subtotalMinor + vatMinor;
  return {
    seats,
    seatMinimum: cfg.minSeats,
    pricePerSeatMinor,
    vatPercent: cfg.vatPercent,
    vatBps,
    subtotalMinor,
    vatMinor,
    totalMinor,
    currency: "NGN",
  };
}

function isSecureRequest(event) {
  const headers = event && event.headers ? event.headers : {};
  const proto = String(headers["x-forwarded-proto"] || headers["X-Forwarded-Proto"] || "").toLowerCase();
  if (proto) return proto === "https";
  const host = String(headers.host || headers.Host || "").toLowerCase();
  return host && host.indexOf("localhost") === -1 && host.indexOf("127.0.0.1") === -1;
}

function parseCookieValue(cookieHeader, name) {
  const entries = String(cookieHeader || "").split(";");
  for (const entry of entries) {
    const [k, ...rest] = entry.trim().split("=");
    if (!k || k !== name) continue;
    return decodeURIComponent(rest.join("=") || "");
  }
  return "";
}

function readCookieHeader(event) {
  const headers = event && event.headers ? event.headers : {};
  return headers.cookie || headers.Cookie || "";
}

function buildSetCookie(event, value, maxAge) {
  const attrs = [
    `${SCHOOL_ADMIN_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Number(maxAge) || 0)}`,
  ];
  if (isSecureRequest(event)) attrs.push("Secure");
  return attrs.join("; ");
}

function clearSchoolAdminCookie(event) {
  return buildSetCookie(event, "", 0);
}

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (_error) {
    return;
  }
}

async function ensureSchoolTables(pool) {
  await applyRuntimeSettings(pool);
  await ensureLearningTables(pool);
  await ensureStudentAuthTables(pool);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHOOL_ACCOUNTS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      school_uuid VARCHAR(64) NOT NULL,
      school_name VARCHAR(220) NOT NULL,
      course_slug VARCHAR(120) NOT NULL,
      seats_purchased INT NOT NULL DEFAULT 0,
      price_per_student_minor INT NOT NULL DEFAULT 0,
      vat_bps INT NOT NULL DEFAULT 0,
      subtotal_minor BIGINT NOT NULL DEFAULT 0,
      vat_minor BIGINT NOT NULL DEFAULT 0,
      total_minor BIGINT NOT NULL DEFAULT 0,
      status VARCHAR(40) NOT NULL DEFAULT 'active',
      paid_at DATETIME NULL,
      access_starts_at DATETIME NULL,
      access_expires_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_school_uuid (school_uuid),
      KEY idx_school_course (course_slug, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHOOL_ORDERS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      order_uuid VARCHAR(64) NOT NULL,
      school_id BIGINT NULL,
      school_name VARCHAR(220) NOT NULL,
      admin_name VARCHAR(180) NOT NULL,
      admin_email VARCHAR(220) NOT NULL,
      admin_phone VARCHAR(80) NULL,
      course_slug VARCHAR(120) NOT NULL,
      seats_requested INT NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'NGN',
      price_per_student_minor INT NOT NULL DEFAULT 0,
      vat_bps INT NOT NULL DEFAULT 0,
      subtotal_minor BIGINT NOT NULL DEFAULT 0,
      vat_minor BIGINT NOT NULL DEFAULT 0,
      total_minor BIGINT NOT NULL DEFAULT 0,
      provider VARCHAR(40) NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'pending',
      provider_reference VARCHAR(190) NULL,
      provider_order_id VARCHAR(190) NULL,
      paid_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_school_order_uuid (order_uuid),
      KEY idx_school_order_ref (provider_reference),
      KEY idx_school_order_pid (provider_order_id),
      KEY idx_school_order_email (admin_email),
      KEY idx_school_order_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHOOL_ADMINS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      school_id BIGINT NOT NULL,
      admin_uuid VARCHAR(64) NOT NULL,
      full_name VARCHAR(180) NOT NULL,
      email VARCHAR(220) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      password_salt VARCHAR(255) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      last_login_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_school_admin_uuid (admin_uuid),
      UNIQUE KEY uniq_school_admin_email (email),
      KEY idx_school_admin_school (school_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHOOL_ADMIN_SESSIONS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      session_uuid VARCHAR(64) NOT NULL,
      admin_id BIGINT NOT NULL,
      token_hash VARCHAR(128) NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      last_seen_at DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_school_admin_session_uuid (session_uuid),
      UNIQUE KEY uniq_school_admin_session_token (token_hash),
      KEY idx_school_admin_session_admin (admin_id),
      KEY idx_school_admin_session_expiry (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHOOL_STUDENTS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      school_id BIGINT NOT NULL,
      student_uuid VARCHAR(64) NOT NULL,
      full_name VARCHAR(180) NOT NULL,
      email VARCHAR(220) NOT NULL,
      account_id BIGINT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'active',
      disabled_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_school_student_uuid (student_uuid),
      UNIQUE KEY uniq_school_student_email (school_id, email),
      KEY idx_school_student_school (school_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHOOL_CERTIFICATES_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      school_id BIGINT NOT NULL,
      student_id BIGINT NOT NULL,
      course_slug VARCHAR(120) NOT NULL,
      certificate_no VARCHAR(120) NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'issued',
      issued_by_admin_id BIGINT NOT NULL,
      issued_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_school_cert_no (certificate_no),
      UNIQUE KEY uniq_school_cert_student_course (student_id, course_slug),
      KEY idx_school_cert_school (school_id, issued_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await safeAlter(pool, `ALTER TABLE ${SCHOOL_ORDERS_TABLE} ADD COLUMN school_id BIGINT NULL`);
  await safeAlter(pool, `ALTER TABLE ${SCHOOL_STUDENTS_TABLE} ADD COLUMN account_id BIGINT NULL`);
  await safeAlter(pool, `ALTER TABLE ${SCHOOL_STUDENTS_TABLE} ADD COLUMN website_url VARCHAR(1000) NULL`);
  await safeAlter(pool, `ALTER TABLE ${SCHOOL_STUDENTS_TABLE} ADD COLUMN website_submitted_at DATETIME NULL`);
  await safeAlter(pool, `ALTER TABLE ${SCHOOL_ADMINS_TABLE} ADD COLUMN reset_token_hash VARCHAR(128) NULL`);
  await safeAlter(pool, `ALTER TABLE ${SCHOOL_ADMINS_TABLE} ADD COLUMN reset_token_expires_at DATETIME NULL`);
  await safeAlter(pool, `ALTER TABLE ${SCHOOL_ADMINS_TABLE} ADD COLUMN reset_requested_at DATETIME NULL`);

  await ensureCourseSlugForeignKey(pool, {
    tableName: SCHOOL_ORDERS_TABLE,
    columnName: "course_slug",
    constraintName: "fk_school_orders_learning_course_slug",
  });
  await ensureCourseSlugForeignKey(pool, {
    tableName: SCHOOL_ACCOUNTS_TABLE,
    columnName: "course_slug",
    constraintName: "fk_school_accounts_learning_course_slug",
  });
}

function hashPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password || ""), String(salt || ""), 64, (error, derivedKey) => {
      if (error) return reject(error);
      return resolve(derivedKey.toString("hex"));
    });
  });
}

function randomToken() {
  return crypto.randomBytes(48).toString("base64url");
}

function shaToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function sqlDateFromNow(ms) {
  return new Date(Date.now() + Math.max(0, Number(ms) || 0)).toISOString().slice(0, 19).replace("T", " ");
}

async function findSchoolAdminByEmail(pool, emailInput) {
  const email = normalizeEmail(emailInput);
  if (!email) return null;
  const [rows] = await pool.query(
    `SELECT id, school_id, admin_uuid, full_name, email, password_hash, password_salt, is_active,
            reset_token_hash, reset_token_expires_at
     FROM ${SCHOOL_ADMINS_TABLE}
     WHERE email = ?
     LIMIT 1`,
    [email]
  );
  return rows && rows.length ? rows[0] : null;
}

async function verifySchoolAdminCredentials(pool, input) {
  const email = normalizeEmail(input && input.email);
  const password = String((input && input.password) || "");
  if (!email || password.length < 1) return null;
  const admin = await findSchoolAdminByEmail(pool, email);
  if (!admin || Number(admin.is_active || 0) !== 1) return null;
  const hash = await hashPassword(password, admin.password_salt);
  const left = Buffer.from(String(hash));
  const right = Buffer.from(String(admin.password_hash || ""));
  if (left.length !== right.length) return null;
  const ok = crypto.timingSafeEqual(left, right);
  if (!ok) return null;
  return admin;
}

async function createSchoolAdmin(pool, input) {
  const schoolId = Number(input && input.schoolId);
  const fullName = clean(input && input.fullName, 180);
  const email = normalizeEmail(input && input.email);
  const password = clean(input && input.password, 200);
  if (!Number.isFinite(schoolId) || schoolId <= 0) throw new Error("Invalid schoolId");
  if (!fullName || !email || password.length < 8) throw new Error("School admin name, email, and password are required");

  const adminUuid = `sca_${crypto.randomUUID().replace(/-/g, "")}`;
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await hashPassword(password, salt);
  const now = nowSql();

  await pool.query(
    `INSERT INTO ${SCHOOL_ADMINS_TABLE}
      (school_id, admin_uuid, full_name, email, password_hash, password_salt, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [schoolId, adminUuid, fullName, email, hash, salt, now, now]
  );

  const [rows] = await pool.query(
    `SELECT id, school_id, admin_uuid, full_name, email
     FROM ${SCHOOL_ADMINS_TABLE}
     WHERE admin_uuid = ?
     LIMIT 1`,
    [adminUuid]
  );
  return rows && rows.length ? rows[0] : null;
}

async function setSchoolAdminPassword(pool, input) {
  const adminId = Number(input && input.adminId);
  const password = String((input && input.password) || "");
  if (!Number.isFinite(adminId) || adminId <= 0) throw new Error("Invalid admin id");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await hashPassword(password, salt);
  await pool.query(
    `UPDATE ${SCHOOL_ADMINS_TABLE}
     SET password_hash = ?, password_salt = ?,
         reset_token_hash = NULL, reset_token_expires_at = NULL, reset_requested_at = NULL,
         updated_at = ?
     WHERE id = ?
     LIMIT 1`,
    [hash, salt, nowSql(), adminId]
  );
}

async function createSchoolAdminPasswordResetToken(pool, emailInput) {
  const admin = await findSchoolAdminByEmail(pool, emailInput);
  if (!admin || !admin.id || Number(admin.is_active || 0) !== 1) return null;

  const rawToken = randomToken();
  const tokenHash = shaToken(rawToken);
  await pool.query(
    `UPDATE ${SCHOOL_ADMINS_TABLE}
     SET reset_token_hash = ?, reset_token_expires_at = ?, reset_requested_at = ?, updated_at = ?
     WHERE id = ?
     LIMIT 1`,
    [tokenHash, sqlDateFromNow(1000 * 60 * 60), nowSql(), nowSql(), Number(admin.id)]
  );

  return {
    token: rawToken,
    adminId: Number(admin.id),
    email: clean(admin.email, 220),
    fullName: clean(admin.full_name, 180),
  };
}

async function consumeSchoolAdminPasswordResetToken(pool, input) {
  const token = String((input && input.token) || "").trim();
  const password = String((input && input.password) || "");
  if (!token) throw new Error("Reset token is required");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");

  const tokenHash = shaToken(token);
  const [rows] = await pool.query(
    `SELECT id, email, full_name, is_active, reset_token_expires_at
     FROM ${SCHOOL_ADMINS_TABLE}
     WHERE reset_token_hash = ?
     LIMIT 1`,
    [tokenHash]
  );
  if (!rows || !rows.length) throw new Error("Invalid or expired reset token");
  const admin = rows[0];
  if (Number(admin.is_active || 0) !== 1) throw new Error("Admin account disabled");
  const exp = new Date(admin.reset_token_expires_at).getTime();
  if (!Number.isFinite(exp) || exp < Date.now()) throw new Error("Invalid or expired reset token");

  await setSchoolAdminPassword(pool, { adminId: Number(admin.id), password });
  return {
    id: Number(admin.id),
    email: clean(admin.email, 220),
    fullName: clean(admin.full_name, 180),
  };
}

async function createSchoolAdminSession(pool, adminId) {
  const token = randomToken();
  const tokenHash = shaToken(token);
  const sessionUuid = `scs_${crypto.randomUUID().replace(/-/g, "")}`;
  const now = nowSql();
  const expires = new Date(Date.now() + SCHOOL_ADMIN_SESSION_MAX_AGE * 1000).toISOString().slice(0, 19).replace("T", " ");

  await pool.query(
    `INSERT INTO ${SCHOOL_ADMIN_SESSIONS_TABLE}
      (session_uuid, admin_id, token_hash, expires_at, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [sessionUuid, Number(adminId), tokenHash, expires, now, now]
  );
  await pool.query(
    `UPDATE ${SCHOOL_ADMINS_TABLE}
     SET last_login_at = ?, updated_at = ?
     WHERE id = ?
     LIMIT 1`,
    [now, now, Number(adminId)]
  );

  return token;
}

function setSchoolAdminCookieHeader(event, token) {
  return buildSetCookie(event, token, SCHOOL_ADMIN_SESSION_MAX_AGE);
}

async function clearSchoolAdminSession(pool, event) {
  const token = parseCookieValue(readCookieHeader(event), SCHOOL_ADMIN_COOKIE);
  if (token) {
    const hash = shaToken(token);
    await pool.query(`DELETE FROM ${SCHOOL_ADMIN_SESSIONS_TABLE} WHERE token_hash = ?`, [hash]);
  }
  return clearSchoolAdminCookie(event);
}

async function requireSchoolAdminSession(pool, event) {
  const token = parseCookieValue(readCookieHeader(event), SCHOOL_ADMIN_COOKIE);
  if (!token) return { ok: false, statusCode: 401, error: "Not signed in" };
  const tokenHash = shaToken(token);

  const [rows] = await pool.query(
    `SELECT
       s.id AS session_id,
       s.expires_at,
       a.id AS admin_id,
       a.school_id,
       a.full_name AS admin_name,
       a.email AS admin_email,
       a.is_active AS admin_is_active,
       sc.school_name,
       sc.course_slug,
       sc.seats_purchased,
       sc.status AS school_status,
       sc.access_expires_at
     FROM ${SCHOOL_ADMIN_SESSIONS_TABLE} s
     JOIN ${SCHOOL_ADMINS_TABLE} a ON a.id = s.admin_id
     JOIN ${SCHOOL_ACCOUNTS_TABLE} sc ON sc.id = a.school_id
     WHERE s.token_hash = ?
     LIMIT 1`,
    [tokenHash]
  );
  if (!rows || !rows.length) return { ok: false, statusCode: 401, error: "Session invalid" };
  const row = rows[0];
  const exp = new Date(row.expires_at).getTime();
  if (!Number.isFinite(exp) || exp < Date.now()) return { ok: false, statusCode: 401, error: "Session expired" };
  if (Number(row.admin_is_active || 0) !== 1) return { ok: false, statusCode: 403, error: "Admin account disabled" };

  await pool.query(`UPDATE ${SCHOOL_ADMIN_SESSIONS_TABLE} SET last_seen_at = ? WHERE id = ?`, [nowSql(), Number(row.session_id)]);
  return {
    ok: true,
    admin: {
      id: Number(row.admin_id),
      fullName: clean(row.admin_name, 180),
      email: clean(row.admin_email, 220),
      schoolId: Number(row.school_id),
      schoolName: clean(row.school_name, 220),
      courseSlug: clean(row.course_slug, 120),
      seatsPurchased: Number(row.seats_purchased || 0),
      schoolStatus: clean(row.school_status, 40),
      accessExpiresAt: row.access_expires_at ? new Date(row.access_expires_at).toISOString() : null,
    },
  };
}

async function createSchoolOrder(pool, input) {
  const schoolName = clean(input && input.schoolName, 220);
  const adminName = clean(input && input.adminName, 180);
  const adminEmail = normalizeEmail(input && input.adminEmail);
  const adminPhone = clean(input && input.adminPhone, 80);
  const courseSlug = clean(input && input.courseSlug, 120).toLowerCase() || "prompt-to-profit";
  const provider = clean(input && input.provider, 40).toLowerCase() || "paystack";
  const pricing = schoolsPricing(input && input.seatsRequested);

  if (!schoolName || !adminName || !adminEmail) {
    throw new Error("School name, admin name, and valid admin email are required");
  }
  if (courseSlug !== "prompt-to-profit") throw new Error("Only prompt-to-profit is available for schools right now");
  if (pricing.seats < pricing.seatMinimum) throw new Error(`Minimum seats is ${pricing.seatMinimum}`);

  const orderUuid = `sord_${crypto.randomUUID().replace(/-/g, "")}`;
  const now = nowSql();
  await pool.query(
    `INSERT INTO ${SCHOOL_ORDERS_TABLE}
      (order_uuid, school_name, admin_name, admin_email, admin_phone, course_slug, seats_requested, currency,
       price_per_student_minor, vat_bps, subtotal_minor, vat_minor, total_minor, provider, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [
      orderUuid,
      schoolName,
      adminName,
      adminEmail,
      adminPhone || null,
      courseSlug,
      pricing.seats,
      pricing.currency,
      pricing.pricePerSeatMinor,
      pricing.vatBps,
      pricing.subtotalMinor,
      pricing.vatMinor,
      pricing.totalMinor,
      provider,
      now,
      now,
    ]
  );

  return { orderUuid, pricing, courseSlug };
}

function oneYearLaterSql(baseDate) {
  const d = baseDate ? new Date(baseDate) : new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

async function markSchoolOrderPaidBy(pool, input) {
  const providerReference = clean(input && input.providerReference, 190);
  const providerOrderId = clean(input && input.providerOrderId, 190);
  const orderUuid = clean(input && input.orderUuid, 80);
  const provider = clean(input && input.provider, 40) || "paystack";

  if (!providerReference && !providerOrderId && !orderUuid) {
    return { ok: false, error: "Missing order identifier" };
  }

  const where = [];
  const params = [];
  if (orderUuid) {
    where.push("order_uuid = ?");
    params.push(orderUuid);
  }
  if (providerReference) {
    where.push("provider_reference = ?");
    params.push(providerReference);
  }
  if (providerOrderId) {
    where.push("provider_order_id = ?");
    params.push(providerOrderId);
  }

  const [rows] = await pool.query(
    `SELECT id, order_uuid, school_id, school_name, admin_name, admin_email, course_slug, seats_requested,
            price_per_student_minor, vat_bps, subtotal_minor, vat_minor, total_minor, status
     FROM ${SCHOOL_ORDERS_TABLE}
     WHERE ${where.join(" OR ")}
     ORDER BY id DESC
     LIMIT 1`,
    params
  );
  if (!rows || !rows.length) return { ok: false, error: "School order not found" };
  const order = rows[0];
  const now = nowSql();

  if (String(order.status) !== "paid") {
    await pool.query(
      `UPDATE ${SCHOOL_ORDERS_TABLE}
       SET status = 'paid',
           provider = COALESCE(?, provider),
           provider_reference = COALESCE(?, provider_reference),
           provider_order_id = COALESCE(?, provider_order_id),
           paid_at = ?,
           updated_at = ?
       WHERE id = ?`,
      [provider, providerReference || null, providerOrderId || null, now, now, Number(order.id)]
    );
  }

  let schoolId = Number(order.school_id || 0);
  if (!schoolId) {
    const schoolUuid = `sch_${crypto.randomUUID().replace(/-/g, "")}`;
    const startsAt = now;
    const expiresAt = oneYearLaterSql(new Date());
    await pool.query(
      `INSERT INTO ${SCHOOL_ACCOUNTS_TABLE}
        (school_uuid, school_name, course_slug, seats_purchased, price_per_student_minor, vat_bps, subtotal_minor, vat_minor, total_minor, status, paid_at, access_starts_at, access_expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
      [
        schoolUuid,
        clean(order.school_name, 220),
        clean(order.course_slug, 120),
        Number(order.seats_requested || 0),
        Number(order.price_per_student_minor || 0),
        Number(order.vat_bps || 0),
        Number(order.subtotal_minor || 0),
        Number(order.vat_minor || 0),
        Number(order.total_minor || 0),
        now,
        startsAt,
        expiresAt,
        now,
        now,
      ]
    );
    const [schoolRows] = await pool.query(
      `SELECT id
       FROM ${SCHOOL_ACCOUNTS_TABLE}
       WHERE school_uuid = ?
       LIMIT 1`,
      [schoolUuid]
    );
    schoolId = Number(schoolRows && schoolRows[0] && schoolRows[0].id || 0);
    if (!schoolId) throw new Error("Could not provision school account");
    await pool.query(`UPDATE ${SCHOOL_ORDERS_TABLE} SET school_id = ?, updated_at = ? WHERE id = ?`, [schoolId, nowSql(), Number(order.id)]);
  }

  let admin = await findSchoolAdminByEmail(pool, order.admin_email);
  let tempPassword = "";
  if (!admin) {
    tempPassword = crypto.randomBytes(8).toString("base64url") + "A9!";
    admin = await createSchoolAdmin(pool, {
      schoolId,
      fullName: order.admin_name,
      email: order.admin_email,
      password: tempPassword,
    });
  }
  if (!admin || !admin.id) throw new Error("Could not provision school admin");

  return {
    ok: true,
    orderUuid: clean(order.order_uuid, 80),
    schoolId,
    adminId: Number(admin.id),
    adminEmail: clean(order.admin_email, 220),
    adminName: clean(order.admin_name, 180),
    tempPassword,
    courseSlug: clean(order.course_slug, 120),
  };
}

function parseCsv(text) {
  const src = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (!inQuotes && ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if (row.length && row.some((item) => clean(item, 500) !== "")) rows.push(row);
  return rows;
}

function schoolStudentsCsvTemplate() {
  return "full_name,email\nJane Doe,jane@example.com\nJohn Doe,john@example.com\n";
}

async function seatsUsage(pool, schoolId) {
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS used
     FROM ${SCHOOL_STUDENTS_TABLE}
     WHERE school_id = ?
       AND status = 'active'`,
    [Number(schoolId)]
  );
  return Number(countRows && countRows[0] && countRows[0].used || 0);
}

async function addSchoolStudents(pool, input) {
  const schoolId = Number(input && input.schoolId);
  const courseSlug = clean(input && input.courseSlug, 120).toLowerCase() || "prompt-to-profit";
  const rows = Array.isArray(input && input.rows) ? input.rows : [];
  if (!Number.isFinite(schoolId) || schoolId <= 0) throw new Error("Invalid schoolId");

  const [schoolRows] = await pool.query(
    `SELECT seats_purchased
     FROM ${SCHOOL_ACCOUNTS_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [schoolId]
  );
  if (!schoolRows || !schoolRows.length) throw new Error("School not found");
  const purchased = Number(schoolRows[0].seats_purchased || 0);
  const used = await seatsUsage(pool, schoolId);
  const remaining = Math.max(0, purchased - used);
  if (!remaining) throw new Error("No available seats. Buy more seats to enroll additional students.");

  const results = {
    created: 0,
    updated: 0,
    reactivated: 0,
    skipped: 0,
    errors: [],
    invites: [],
  };

  for (let i = 0; i < rows.length; i += 1) {
    if (results.created + results.reactivated >= remaining) {
      results.errors.push(`Seat cap reached at row ${i + 1}`);
      break;
    }
    const fullName = clean(rows[i] && rows[i].full_name, 180);
    const email = normalizeEmail(rows[i] && rows[i].email);
    if (!fullName || !email) {
      results.errors.push(`Row ${i + 1}: full_name and valid email are required`);
      continue;
    }

    let account = await findStudentByEmail(pool, email);
    let createdAccount = false;
    if (!account) {
      const tempPassword = crypto.randomBytes(8).toString("base64url") + "A9!";
      account = await createStudentAccount(pool, {
        fullName,
        email,
        password: tempPassword,
        mustResetPassword: true,
      });
      createdAccount = true;
    }

    const [existingRows] = await pool.query(
      `SELECT id, status
       FROM ${SCHOOL_STUDENTS_TABLE}
       WHERE school_id = ?
         AND email = ?
       LIMIT 1`,
      [schoolId, email]
    );
    const now = nowSql();
    if (existingRows && existingRows.length) {
      const prevStatus = clean(existingRows[0].status, 40).toLowerCase();
      if (prevStatus !== "active" && results.created + results.reactivated >= remaining) {
        results.errors.push(`Seat cap reached when reactivating row ${i + 1}`);
        continue;
      }
      await pool.query(
        `UPDATE ${SCHOOL_STUDENTS_TABLE}
         SET full_name = ?, account_id = ?, status = 'active', disabled_at = NULL, updated_at = ?
         WHERE id = ?
         LIMIT 1`,
        [fullName, Number(account && account.id || 0) || null, now, Number(existingRows[0].id)]
      );
      const reactivated = prevStatus !== "active";
      if (reactivated) results.reactivated += 1;
      results.updated += 1;
      results.invites.push({
        full_name: fullName,
        email,
        account_id: Number(account && account.id || 0) || null,
        created_account: !!createdAccount,
        reactivated: !!reactivated,
      });
      continue;
    }

    await pool.query(
      `INSERT INTO ${SCHOOL_STUDENTS_TABLE}
        (school_id, student_uuid, full_name, email, account_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
      [schoolId, `sst_${crypto.randomUUID().replace(/-/g, "")}`, fullName, email, Number(account && account.id || 0) || null, now, now]
    );
    results.created += 1;
    results.invites.push({
      full_name: fullName,
      email,
      account_id: Number(account && account.id || 0) || null,
      created_account: !!createdAccount,
      reactivated: false,
    });
  }

  return Object.assign(results, {
    seatsPurchased: purchased,
    seatsUsed: await seatsUsage(pool, schoolId),
  });
}

async function listSchoolStudents(pool, schoolId, courseSlug) {
  const [totRows] = await pool.query(
    `SELECT COUNT(*) AS total_lessons
     FROM ${LESSONS_TABLE} l
     JOIN ${MODULES_TABLE} m ON m.id = l.module_id
     WHERE m.course_slug = ?
       AND m.is_active = 1
       AND l.is_active = 1`,
    [clean(courseSlug, 120)]
  );
  const totalLessons = Number(totRows && totRows[0] && totRows[0].total_lessons || 0);

  const [rows] = await pool.query(
    `SELECT
       s.id,
       s.full_name,
       s.email,
       s.status,
       s.created_at,
       s.updated_at,
       s.account_id,
       s.website_url,
       s.website_submitted_at,
       COUNT(CASE WHEN p.is_completed = 1 THEN 1 END) AS completed_lessons,
       MAX(COALESCE(p.last_watched_at, p.completed_at)) AS last_activity_at
     FROM ${SCHOOL_STUDENTS_TABLE} s
     LEFT JOIN ${LESSON_PROGRESS_TABLE} p ON p.account_id = s.account_id
     LEFT JOIN ${LESSONS_TABLE} l ON l.id = p.lesson_id AND l.is_active = 1
     LEFT JOIN ${MODULES_TABLE} m ON m.id = l.module_id AND m.course_slug = ? AND m.is_active = 1
     WHERE s.school_id = ?
     GROUP BY s.id, s.full_name, s.email, s.status, s.created_at, s.updated_at, s.account_id
     ORDER BY s.created_at DESC, s.id DESC`,
    [clean(courseSlug, 120), Number(schoolId)]
  );
  return (Array.isArray(rows) ? rows : []).map(function (row) {
    const completed = Number(row.completed_lessons || 0);
    const total = totalLessons;
    return {
      id: Number(row.id),
      full_name: clean(row.full_name, 180),
      email: clean(row.email, 220),
      status: clean(row.status, 40) || "active",
      account_id: Number(row.account_id || 0) || null,
      website_url: clean(row.website_url, 1000) || "",
      website_submitted_at: row.website_submitted_at ? new Date(row.website_submitted_at).toISOString() : null,
      completed_lessons: completed,
      total_lessons: total,
      completion_percent: total ? Math.round((completed / total) * 100) : 0,
      last_activity_at: row.last_activity_at ? new Date(row.last_activity_at).toISOString() : null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    };
  });
}

async function submitSchoolStudentWebsite(pool, input) {
  const accountId = Number(input && input.accountId);
  const email = normalizeEmail(input && input.email);
  const courseSlug = clean(input && input.courseSlug, 120).toLowerCase();
  const websiteUrl = normalizeWebsiteUrl(input && input.websiteUrl);
  if (!courseSlug) throw new Error("course_slug is required");
  if (!websiteUrl) throw new Error("Enter a valid website URL.");
  if ((!Number.isFinite(accountId) || accountId <= 0) && !email) throw new Error("Student account is required");

  const whereAccount = Number.isFinite(accountId) && accountId > 0 ? " OR ss.account_id = ?" : "";
  const params = [email, courseSlug];
  if (whereAccount) params.push(accountId);
  const [rows] = await pool.query(
    `SELECT ss.id, ss.school_id, ss.full_name, ss.email, sc.school_name
     FROM ${SCHOOL_STUDENTS_TABLE} ss
     JOIN ${SCHOOL_ACCOUNTS_TABLE} sc ON sc.id = ss.school_id
     WHERE (LOWER(ss.email) = ?${whereAccount})
       AND ss.status = 'active'
       AND sc.status = 'active'
       AND sc.course_slug = ?
       AND (sc.access_starts_at IS NULL OR sc.access_starts_at <= NOW())
       AND (sc.access_expires_at IS NULL OR sc.access_expires_at >= NOW())
     ORDER BY ss.id DESC
     LIMIT 1`,
    params
  );
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("No active school enrollment found for this course.");
  }
  const student = rows[0];
  await pool.query(
    `UPDATE ${SCHOOL_STUDENTS_TABLE}
     SET website_url = ?, website_submitted_at = ?, updated_at = ?
     WHERE id = ?
     LIMIT 1`,
    [websiteUrl, nowSql(), nowSql(), Number(student.id)]
  );

  const [adminRows] = await pool.query(
    `SELECT full_name, email
     FROM ${SCHOOL_ADMINS_TABLE}
     WHERE school_id = ?
       AND is_active = 1`,
    [Number(student.school_id)]
  );

  return {
    studentId: Number(student.id),
    schoolId: Number(student.school_id),
    schoolName: clean(student.school_name, 220),
    studentName: clean(student.full_name, 180),
    studentEmail: clean(student.email, 220),
    websiteUrl,
    adminRecipients: (adminRows || []).map(function (row) {
      return {
        fullName: clean(row.full_name, 180),
        email: normalizeEmail(row.email),
      };
    }).filter(function (row) {
      return !!row.email;
    }),
  };
}

async function setSchoolStudentStatus(pool, input) {
  const schoolId = Number(input && input.schoolId);
  const studentId = Number(input && input.studentId);
  const active = !!(input && input.active);
  if (!Number.isFinite(schoolId) || schoolId <= 0) throw new Error("Invalid schoolId");
  if (!Number.isFinite(studentId) || studentId <= 0) throw new Error("Invalid studentId");

  await pool.query(
    `UPDATE ${SCHOOL_STUDENTS_TABLE}
     SET status = ?, disabled_at = ?, updated_at = ?
     WHERE id = ?
       AND school_id = ?
     LIMIT 1`,
    [active ? "active" : "disabled", active ? null : nowSql(), nowSql(), studentId, schoolId]
  );
}

async function schoolAnalytics(pool, schoolId, courseSlug) {
  const [seatRows] = await pool.query(
    `SELECT seats_purchased, access_expires_at
     FROM ${SCHOOL_ACCOUNTS_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [Number(schoolId)]
  );
  const seatsPurchased = Number(seatRows && seatRows[0] && seatRows[0].seats_purchased || 0);
  const expiresAt = seatRows && seatRows[0] && seatRows[0].access_expires_at ? new Date(seatRows[0].access_expires_at).toISOString() : null;
  const seatsUsed = await seatsUsage(pool, schoolId);

  const students = await listSchoolStudents(pool, schoolId, courseSlug);
  const activeStudents = students.filter((s) => s.status === "active");
  const avgCompletion = activeStudents.length
    ? Math.round(activeStudents.reduce((sum, s) => sum + Number(s.completion_percent || 0), 0) / activeStudents.length)
    : 0;
  const completedStudents = activeStudents.filter((s) => Number(s.completion_percent || 0) >= 100).length;
  const active7Days = activeStudents.filter((s) => {
    const t = s.last_activity_at ? new Date(s.last_activity_at).getTime() : 0;
    return t && (Date.now() - t <= 7 * 24 * 60 * 60 * 1000);
  }).length;

  return {
    seats_purchased: seatsPurchased,
    seats_used: seatsUsed,
    seats_available: Math.max(0, seatsPurchased - seatsUsed),
    access_expires_at: expiresAt,
    students_total: students.length,
    students_active: activeStudents.length,
    students_completed: completedStudents,
    active_last_7_days: active7Days,
    average_completion_percent: avgCompletion,
  };
}

async function getSchoolCourseAccessState(pool, input) {
  const accountId = Number(input && input.accountId);
  const email = normalizeEmail(input && input.email);
  const courseSlug = clean(input && input.courseSlug, 120).toLowerCase();
  if (!courseSlug) return { allowed: false, reason: "invalid_course" };

  const whereAccount = Number.isFinite(accountId) && accountId > 0 ? " OR ss.account_id = ?" : "";
  const params = [email, courseSlug];
  if (whereAccount) params.push(accountId);
  const [rows] = await pool.query(
    `SELECT 1
     FROM ${SCHOOL_STUDENTS_TABLE} ss
     JOIN ${SCHOOL_ACCOUNTS_TABLE} sc ON sc.id = ss.school_id
     WHERE (LOWER(ss.email) COLLATE utf8mb4_general_ci = ?${whereAccount})
       AND ss.status = 'active'
       AND sc.status = 'active'
       AND sc.course_slug = ?
       AND (sc.access_starts_at IS NULL OR sc.access_starts_at <= NOW())
       AND (sc.access_expires_at IS NULL OR sc.access_expires_at >= NOW())
     LIMIT 1`,
    params
  );
  if (Array.isArray(rows) && rows.length > 0) {
    return { allowed: true, reason: "school_active" };
  }

  const [futureRows] = await pool.query(
    `SELECT DATE_FORMAT(MIN(sc.access_starts_at), '%Y-%m-%d %H:%i:%s') AS next_start_at
     FROM ${SCHOOL_STUDENTS_TABLE} ss
     JOIN ${SCHOOL_ACCOUNTS_TABLE} sc ON sc.id = ss.school_id
     WHERE (LOWER(ss.email) COLLATE utf8mb4_general_ci = ?${whereAccount})
       AND ss.status = 'active'
       AND sc.status = 'active'
       AND sc.course_slug = ?
       AND sc.access_starts_at IS NOT NULL
       AND sc.access_starts_at > NOW()
       AND (sc.access_expires_at IS NULL OR sc.access_expires_at >= NOW())`,
    params
  );
  const nextStartAt = futureRows && futureRows[0] && futureRows[0].next_start_at
    ? String(futureRows[0].next_start_at)
    : "";
  if (nextStartAt) {
    return {
      allowed: false,
      reason: "school_access_not_started",
      next_start_at: nextStartAt,
    };
  }

  return { allowed: false, reason: "school_not_found" };
}

async function hasSchoolCourseAccess(pool, input) {
  const state = await getSchoolCourseAccessState(pool, input);
  return !!(state && state.allowed);
}

module.exports = {
  SCHOOL_ORDERS_TABLE,
  SCHOOL_ACCOUNTS_TABLE,
  SCHOOL_STUDENTS_TABLE,
  SCHOOL_CERTIFICATES_TABLE,
  DEFAULT_SCHOOLS_MIN_SEATS,
  DEFAULT_SCHOOLS_PRICE_PER_STUDENT_MINOR,
  DEFAULT_SITE_VAT_PERCENT,
  schoolsPricingConfig,
  schoolsPricing,
  ensureSchoolTables,
  createSchoolOrder,
  markSchoolOrderPaidBy,
  findSchoolAdminByEmail,
  verifySchoolAdminCredentials,
  createSchoolAdminPasswordResetToken,
  consumeSchoolAdminPasswordResetToken,
  createSchoolAdmin,
  createSchoolAdminSession,
  setSchoolAdminCookieHeader,
  clearSchoolAdminSession,
  requireSchoolAdminSession,
  schoolStudentsCsvTemplate,
  parseCsv,
  addSchoolStudents,
  listSchoolStudents,
  setSchoolStudentStatus,
  schoolAnalytics,
  submitSchoolStudentWebsite,
  getSchoolCourseAccessState,
  hasSchoolCourseAccess,
};
