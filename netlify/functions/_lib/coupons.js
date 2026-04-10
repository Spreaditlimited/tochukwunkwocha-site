const { nowSql } = require("./db");
const { applyRuntimeSettings } = require("./runtime-settings");
const { runtimeSchemaChangesAllowed } = require("./schema-mode");
let couponsTablesEnsured = false;
let couponsTablesEnsurePromise = null;

function normalizeCouponCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-_]/g, "")
    .slice(0, 40);
}

function normalizeDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6] || "00"}`;
}

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (_error) {
    return;
  }
}

async function ensureCouponsTables(pool) {
  if (couponsTablesEnsured) return;
  if (!runtimeSchemaChangesAllowed()) {
    couponsTablesEnsured = true;
    return;
  }
  if (couponsTablesEnsurePromise) {
    await couponsTablesEnsurePromise;
    return;
  }

  couponsTablesEnsurePromise = (async function () {
    await applyRuntimeSettings(pool);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS course_coupons (
        id BIGINT NOT NULL AUTO_INCREMENT,
        code VARCHAR(40) NOT NULL,
        description VARCHAR(240) NULL,
        discount_type VARCHAR(16) NOT NULL,
        percent_off DECIMAL(6,2) NULL,
        fixed_ngn_minor INT NULL,
        fixed_gbp_minor INT NULL,
        course_slug VARCHAR(120) NULL,
        starts_at DATETIME NULL,
        ends_at DATETIME NULL,
        max_uses INT NULL,
        max_uses_per_email INT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_coupon_code (code),
        KEY idx_coupon_active_dates (is_active, starts_at, ends_at),
        KEY idx_coupon_course_slug (course_slug)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS coupon_redemptions (
        id BIGINT NOT NULL AUTO_INCREMENT,
        coupon_id BIGINT NOT NULL,
        order_uuid VARCHAR(64) NOT NULL,
        email VARCHAR(255) NOT NULL,
        currency VARCHAR(8) NOT NULL,
        discount_minor INT NOT NULL,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_coupon_order (coupon_id, order_uuid),
        KEY idx_coupon_redemptions_coupon (coupon_id, created_at),
        KEY idx_coupon_redemptions_email (coupon_id, email),
        CONSTRAINT fk_coupon_redemptions_coupon
          FOREIGN KEY (coupon_id)
          REFERENCES course_coupons(id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await safeAlter(pool, `ALTER TABLE course_coupons ADD COLUMN description VARCHAR(240) NULL`);
    await safeAlter(pool, `ALTER TABLE course_coupons ADD COLUMN course_slug VARCHAR(120) NULL`);
    await safeAlter(pool, `ALTER TABLE course_coupons ADD COLUMN starts_at DATETIME NULL`);
    await safeAlter(pool, `ALTER TABLE course_coupons ADD COLUMN ends_at DATETIME NULL`);
    await safeAlter(pool, `ALTER TABLE course_coupons ADD COLUMN max_uses INT NULL`);
    await safeAlter(pool, `ALTER TABLE course_coupons ADD COLUMN max_uses_per_email INT NULL`);
    await safeAlter(pool, `ALTER TABLE course_coupons ADD COLUMN fixed_gbp_minor INT NULL`);
    couponsTablesEnsured = true;
  })();

  try {
    await couponsTablesEnsurePromise;
  } finally {
    couponsTablesEnsurePromise = null;
  }
}

function resolveDiscountMinor({ coupon, currency, baseAmountMinor }) {
  const base = Math.max(0, Number(baseAmountMinor || 0));
  const type = String((coupon && coupon.discount_type) || "").toLowerCase();
  if (base <= 0) return 0;

  if (type === "percent") {
    const pct = Number(coupon.percent_off || 0);
    if (!Number.isFinite(pct) || pct <= 0) return 0;
    return Math.min(base, Math.round((base * pct) / 100));
  }

  const cur = String(currency || "").toUpperCase();
  const fixed = cur === "NGN" ? Number(coupon.fixed_ngn_minor || 0) : Number(coupon.fixed_gbp_minor || 0);
  if (!Number.isFinite(fixed) || fixed <= 0) return 0;
  return Math.min(base, Math.round(fixed));
}

async function getCouponByCode(pool, code) {
  const normalized = normalizeCouponCode(code);
  if (!normalized) return null;
  await ensureCouponsTables(pool);
  const [rows] = await pool.query(
    `SELECT id, code, description, discount_type, percent_off, fixed_ngn_minor, fixed_gbp_minor,
            course_slug,
            DATE_FORMAT(starts_at, '%Y-%m-%d %H:%i:%s') AS starts_at,
            DATE_FORMAT(ends_at, '%Y-%m-%d %H:%i:%s') AS ends_at,
            max_uses, max_uses_per_email, is_active,
            created_at, updated_at
     FROM course_coupons
     WHERE code = ?
     LIMIT 1`,
    [normalized]
  );
  return rows && rows.length ? rows[0] : null;
}

function parseDateTimeParts(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] || "0"),
  };
}

function toWallClockMs(parts) {
  if (!parts) return null;
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function nowInTimeZoneWallClockMs(timeZone) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: String(timeZone || "UTC"),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const lookup = {};
  parts.forEach(function (p) {
    if (p && p.type && p.value) lookup[p.type] = p.value;
  });

  return Date.UTC(
    Number(lookup.year || "0"),
    Number(lookup.month || "1") - 1,
    Number(lookup.day || "1"),
    Number(lookup.hour || "0"),
    Number(lookup.minute || "0"),
    Number(lookup.second || "0")
  );
}

function wallClockMsToSql(ms) {
  var value = Number(ms);
  if (!Number.isFinite(value)) return null;
  var d = new Date(value);
  var pad = function (n) {
    return String(n).padStart(2, "0");
  };
  return (
    String(d.getUTCFullYear()) +
    "-" +
    pad(d.getUTCMonth() + 1) +
    "-" +
    pad(d.getUTCDate()) +
    " " +
    pad(d.getUTCHours()) +
    ":" +
    pad(d.getUTCMinutes()) +
    ":" +
    pad(d.getUTCSeconds())
  );
}

async function extendCouponValidity(pool, input) {
  await ensureCouponsTables(pool);
  var id = Number(input && input.id);
  var code = normalizeCouponCode(input && input.code);
  var extendMinutes = Number(input && input.extendMinutes);
  var explicitEndsAt = normalizeDateTime(input && input.endsAt);

  if ((!Number.isFinite(id) || id <= 0) && !code) {
    throw new Error("Coupon id or code is required.");
  }

  var whereSql = Number.isFinite(id) && id > 0 ? "id = ?" : "code = ?";
  var whereValue = Number.isFinite(id) && id > 0 ? id : code;
  var [rows] = await pool.query(
    `SELECT id, code, starts_at, ends_at, is_active FROM course_coupons WHERE ${whereSql} LIMIT 1`,
    [whereValue]
  );
  var coupon = rows && rows.length ? rows[0] : null;
  if (!coupon) throw new Error("Coupon not found.");

  var nowMs = nowInTimeZoneWallClockMs("Africa/Lagos");
  var currentEndMs = toWallClockMs(parseDateTimeParts(coupon.ends_at));
  var nextEndsAt = null;

  if (explicitEndsAt) {
    var explicitMs = toWallClockMs(parseDateTimeParts(explicitEndsAt));
    if (explicitMs === null || explicitMs <= nowMs) {
      throw new Error("End date/time must be in the future.");
    }
    nextEndsAt = explicitEndsAt;
  } else {
    if (!Number.isFinite(extendMinutes) || extendMinutes <= 0) {
      throw new Error("Enter a valid extension duration.");
    }
    var baseMs = currentEndMs !== null && currentEndMs > nowMs ? currentEndMs : nowMs;
    var nextMs = baseMs + Math.round(extendMinutes) * 60000;
    nextEndsAt = wallClockMsToSql(nextMs);
    if (!nextEndsAt) throw new Error("Could not compute new coupon expiry.");
  }

  await pool.query(
    `UPDATE course_coupons
     SET ends_at = ?, updated_at = ?
     WHERE id = ?
     LIMIT 1`,
    [nextEndsAt, nowSql(), Number(coupon.id)]
  );

  return getCouponByCode(pool, coupon.code);
}

async function evaluateCouponForOrder(pool, input, options) {
  await ensureCouponsTables(pool);

  const code = normalizeCouponCode(input && input.couponCode);
  const courseSlug = String((input && input.courseSlug) || "").trim().toLowerCase();
  const email = String((input && input.email) || "").trim().toLowerCase();
  const currency = String((input && input.currency) || "GBP").trim().toUpperCase();
  const baseAmountMinor = Math.max(0, Number((input && input.baseAmountMinor) || 0));

  if (!code) return { ok: false, error: "Enter a valid coupon code." };
  if (baseAmountMinor <= 0) return { ok: false, error: "Invalid order amount." };

  const coupon = await getCouponByCode(pool, code);
  if (!coupon) return { ok: false, error: "Coupon not found." };
  if (!Number(coupon.is_active || 0)) return { ok: false, error: "This coupon is not active." };

  const ignoreExpiry = !!(options && options.ignoreExpiry);
  // Coupon windows follow Lagos wall-clock semantics (consistent with the rest of the platform scheduling UX).
  const nowMs = nowInTimeZoneWallClockMs("Africa/Lagos");
  const startsAtMs = toWallClockMs(parseDateTimeParts(coupon.starts_at));
  const endsAtMs = toWallClockMs(parseDateTimeParts(coupon.ends_at));
  if (startsAtMs !== null && startsAtMs > nowMs) {
    return { ok: false, error: "This coupon is not active yet." };
  }
  if (!ignoreExpiry && endsAtMs !== null && endsAtMs < nowMs) {
    return { ok: false, error: "This coupon has expired." };
  }

  const scopedCourse = String(coupon.course_slug || "").trim().toLowerCase();
  if (scopedCourse && courseSlug && scopedCourse !== courseSlug) {
    return { ok: false, error: "This coupon is not valid for this course." };
  }

  const [usageRows] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM coupon_redemptions WHERE coupon_id = ?) AS total_uses,
       (SELECT COUNT(*) FROM coupon_redemptions WHERE coupon_id = ? AND email = ?) AS email_uses`,
    [coupon.id, coupon.id, email || "__missing_email__"]
  );
  const usage = usageRows && usageRows.length ? usageRows[0] : { total_uses: 0, email_uses: 0 };
  const totalUses = Number(usage.total_uses || 0);
  const emailUses = Number(usage.email_uses || 0);
  const maxUses = Number(coupon.max_uses || 0);
  const maxUsesPerEmail = Number(coupon.max_uses_per_email || 0);

  if (maxUses > 0 && totalUses >= maxUses) {
    return { ok: false, error: "This coupon has reached its usage limit." };
  }
  if (maxUsesPerEmail > 0 && email && emailUses >= maxUsesPerEmail) {
    return { ok: false, error: "You have reached the usage limit for this coupon." };
  }

  const discountMinor = resolveDiscountMinor({ coupon, currency, baseAmountMinor });
  if (!discountMinor || discountMinor <= 0) {
    return { ok: false, error: `This coupon cannot be used for ${currency} checkout.` };
  }

  const finalAmountMinor = Math.max(0, baseAmountMinor - discountMinor);
  if (finalAmountMinor <= 0) {
    return { ok: false, error: "Coupon discount is too high for this checkout amount." };
  }
  return {
    ok: true,
    coupon: {
      id: Number(coupon.id),
      code: String(coupon.code || code),
      description: String(coupon.description || ""),
      discountType: String(coupon.discount_type || "").toLowerCase(),
      percentOff: coupon.percent_off !== null ? Number(coupon.percent_off) : null,
      fixedNgnMinor: coupon.fixed_ngn_minor !== null ? Number(coupon.fixed_ngn_minor) : null,
      fixedGbpMinor: coupon.fixed_gbp_minor !== null ? Number(coupon.fixed_gbp_minor) : null,
    },
    pricing: {
      currency,
      baseAmountMinor,
      discountMinor,
      finalAmountMinor,
    },
  };
}

async function recordCouponRedemption(pool, input) {
  await ensureCouponsTables(pool);
  const couponId = Number(input && input.couponId);
  const orderUuid = String((input && input.orderUuid) || "").trim();
  const email = String((input && input.email) || "").trim().toLowerCase();
  const currency = String((input && input.currency) || "").trim().toUpperCase();
  const discountMinor = Math.max(0, Number((input && input.discountMinor) || 0));
  if (!Number.isFinite(couponId) || couponId <= 0 || !orderUuid || !email || !currency || discountMinor <= 0) return;

  const now = nowSql();
  await pool.query(
    `INSERT INTO coupon_redemptions
      (coupon_id, order_uuid, email, currency, discount_minor, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      discount_minor = VALUES(discount_minor)`,
    [couponId, orderUuid, email, currency, discountMinor, now]
  );
}

async function listCoupons(pool) {
  await ensureCouponsTables(pool);
  const [rows] = await pool.query(
    `SELECT c.id, c.code, c.description, c.discount_type, c.percent_off, c.fixed_ngn_minor, c.fixed_gbp_minor,
            c.course_slug,
            DATE_FORMAT(c.starts_at, '%Y-%m-%d %H:%i:%s') AS starts_at,
            DATE_FORMAT(c.ends_at, '%Y-%m-%d %H:%i:%s') AS ends_at,
            c.max_uses, c.max_uses_per_email, c.is_active,
            DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
            DATE_FORMAT(c.updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at,
            COALESCE(u.total_uses, 0) AS total_uses
     FROM course_coupons c
     LEFT JOIN (
       SELECT coupon_id, COUNT(*) AS total_uses
       FROM coupon_redemptions
       GROUP BY coupon_id
     ) u ON u.coupon_id = c.id
     ORDER BY c.updated_at DESC, c.id DESC`
  );
  return rows || [];
}

async function upsertCoupon(pool, input) {
  await ensureCouponsTables(pool);

  const id = Number(input && input.id);
  const code = normalizeCouponCode(input && input.code);
  if (!code) throw new Error("Coupon code is required.");

  const discountType = String((input && input.discountType) || "percent").trim().toLowerCase();
  if (discountType !== "percent" && discountType !== "fixed") throw new Error("Invalid discount type.");

  const percentOff = input && input.percentOff !== undefined && input.percentOff !== null ? Number(input.percentOff) : null;
  const fixedNgnMinor =
    input && input.fixedNgnMinor !== undefined && input.fixedNgnMinor !== null ? Number(input.fixedNgnMinor) : null;
  const fixedGbpMinor =
    input && input.fixedGbpMinor !== undefined && input.fixedGbpMinor !== null ? Number(input.fixedGbpMinor) : null;
  const courseSlugRaw = String((input && input.courseSlug) || "").trim().toLowerCase();
  const courseSlug = courseSlugRaw === "all" ? "" : courseSlugRaw;
  const startsAt = normalizeDateTime(input && input.startsAt);
  const endsAt = normalizeDateTime(input && input.endsAt);
  const maxUses = input && input.maxUses !== undefined && input.maxUses !== null && String(input.maxUses).trim() !== ""
    ? Number(input.maxUses)
    : null;
  const maxUsesPerEmail =
    input && input.maxUsesPerEmail !== undefined && input.maxUsesPerEmail !== null && String(input.maxUsesPerEmail).trim() !== ""
      ? Number(input.maxUsesPerEmail)
      : null;
  const isActive = input && input.isActive === false ? 0 : 1;
  const description = String((input && input.description) || "").trim().slice(0, 240);

  if (discountType === "percent") {
    if (!Number.isFinite(percentOff) || percentOff <= 0 || percentOff > 100) {
      throw new Error("Percent off must be between 0.01 and 100.");
    }
  } else if (
    (!Number.isFinite(fixedNgnMinor) || fixedNgnMinor <= 0) &&
    (!Number.isFinite(fixedGbpMinor) || fixedGbpMinor <= 0)
  ) {
    throw new Error("Provide at least one fixed amount (NGN or GBP).");
  }

  if (maxUses !== null && (!Number.isFinite(maxUses) || maxUses <= 0)) throw new Error("maxUses must be a positive number.");
  if (maxUsesPerEmail !== null && (!Number.isFinite(maxUsesPerEmail) || maxUsesPerEmail <= 0)) {
    throw new Error("maxUsesPerEmail must be a positive number.");
  }

  const now = nowSql();
  if (Number.isFinite(id) && id > 0) {
    await pool.query(
      `UPDATE course_coupons
       SET code = ?,
           description = ?,
           discount_type = ?,
           percent_off = ?,
           fixed_ngn_minor = ?,
           fixed_gbp_minor = ?,
           course_slug = ?,
           starts_at = ?,
           ends_at = ?,
           max_uses = ?,
           max_uses_per_email = ?,
           is_active = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        code,
        description || null,
        discountType,
        discountType === "percent" ? Number(percentOff) : null,
        Number.isFinite(fixedNgnMinor) ? Math.round(fixedNgnMinor) : null,
        Number.isFinite(fixedGbpMinor) ? Math.round(fixedGbpMinor) : null,
        courseSlug || null,
        startsAt,
        endsAt,
        maxUses !== null ? Math.round(maxUses) : null,
        maxUsesPerEmail !== null ? Math.round(maxUsesPerEmail) : null,
        isActive,
        now,
        id,
      ]
    );
  } else {
    await pool.query(
      `INSERT INTO course_coupons
        (code, description, discount_type, percent_off, fixed_ngn_minor, fixed_gbp_minor, course_slug,
         starts_at, ends_at, max_uses, max_uses_per_email, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         description = VALUES(description),
         discount_type = VALUES(discount_type),
         percent_off = VALUES(percent_off),
         fixed_ngn_minor = VALUES(fixed_ngn_minor),
         fixed_gbp_minor = VALUES(fixed_gbp_minor),
         course_slug = VALUES(course_slug),
         starts_at = VALUES(starts_at),
         ends_at = VALUES(ends_at),
         max_uses = VALUES(max_uses),
         max_uses_per_email = VALUES(max_uses_per_email),
         is_active = VALUES(is_active),
         updated_at = VALUES(updated_at)`,
      [
        code,
        description || null,
        discountType,
        discountType === "percent" ? Number(percentOff) : null,
        Number.isFinite(fixedNgnMinor) ? Math.round(fixedNgnMinor) : null,
        Number.isFinite(fixedGbpMinor) ? Math.round(fixedGbpMinor) : null,
        courseSlug || null,
        startsAt,
        endsAt,
        maxUses !== null ? Math.round(maxUses) : null,
        maxUsesPerEmail !== null ? Math.round(maxUsesPerEmail) : null,
        isActive,
        now,
        now,
      ]
    );
  }

  return getCouponByCode(pool, code);
}

module.exports = {
  normalizeCouponCode,
  ensureCouponsTables,
  evaluateCouponForOrder,
  recordCouponRedemption,
  listCoupons,
  upsertCoupon,
  extendCouponValidity,
};
