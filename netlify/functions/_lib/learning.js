const { nowSql } = require("./db");
const { listCourseConfigs } = require("./course-config");
const { runtimeSchemaChangesAllowed } = require("./schema-mode");

const COURSES_TABLE = "tochukwu_learning_courses";
const VIDEO_ASSETS_TABLE = "tochukwu_learning_video_assets";
const MODULES_TABLE = "tochukwu_learning_modules";
const MODULE_BATCH_DRIPS_TABLE = "tochukwu_learning_module_batch_drips";
const LESSONS_TABLE = "tochukwu_learning_lessons";
let learningTablesEnsured = false;
let learningTablesEnsurePromise = null;

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function toInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Number.isFinite(fallback) ? fallback : 0;
  return Math.trunc(n);
}

function slugify(value, fallback) {
  const base = clean(value, 200)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (base) return base;
  return clean(fallback || "item", 60).toLowerCase();
}

function titleizeSlug(value) {
  return String(value || "")
    .trim()
    .split("-")
    .filter(Boolean)
    .map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function configuredCourseSlugs() {
  const set = new Set();
  (listCourseConfigs() || []).forEach(function (cfg) {
    const slug = clean(cfg && cfg.slug, 120).toLowerCase();
    if (slug) set.add(slug);
  });
  return set;
}

function isListableCourseSlug(rawSlug) {
  const slug = clean(rawSlug, 120).toLowerCase();
  if (!slug) return false;
  // Prevent day-level pseudo-courses from appearing in course catalogs.
  if (/(^|-)day-(one|two|three|four|five|six|seven|eight|nine|ten|\d+)$/.test(slug)) return false;
  return true;
}

function inferCanonicalCourseSlugFromModuleSlug(rawSlug) {
  const slug = clean(rawSlug, 120).toLowerCase();
  if (!slug) return "";
  if (slug === "prompt-to-production" || slug.indexOf("prompt-to-production-") === 0) return "prompt-to-production";
  if (slug === "prompt-to-profit-schools" || slug.indexOf("prompt-to-profit-schools-") === 0) return "prompt-to-profit-schools";
  if (slug === "prompt-to-profit-for-schools" || slug.indexOf("prompt-to-profit-for-schools-") === 0) return "prompt-to-profit-schools";
  if (slug === "prompt-to-profit" || slug.indexOf("prompt-to-profit-") === 0) return "prompt-to-profit";
  return "";
}

async function canonicalizeLegacyModuleCourseSlugs(pool) {
  const allowed = configuredCourseSlugs();
  const [rows] = await pool.query(
    `SELECT id, course_slug, module_slug
     FROM ${MODULES_TABLE}
     ORDER BY id ASC`
  );
  if (!Array.isArray(rows) || !rows.length) return { updated: 0 };

  let updated = 0;
  for (const row of rows) {
    const id = Number(row && row.id || 0);
    if (!(id > 0)) continue;
    const current = clean(row && row.course_slug, 120).toLowerCase();
    if (allowed.has(current)) continue;

    const inferred = inferCanonicalCourseSlugFromModuleSlug(current);
    if (!inferred || !allowed.has(inferred)) continue;

    let nextModuleSlug = clean(row && row.module_slug, 160).toLowerCase();
    if (!nextModuleSlug) nextModuleSlug = `module-${id}`;
    const [dupeRows] = await pool.query(
      `SELECT id
       FROM ${MODULES_TABLE}
       WHERE course_slug = ?
         AND module_slug = ?
         AND id <> ?
       LIMIT 1`,
      [inferred, nextModuleSlug, id]
    );
    if (Array.isArray(dupeRows) && dupeRows.length) {
      nextModuleSlug = `${nextModuleSlug.slice(0, 145)}-${id}`;
    }

    await pool.query(
      `UPDATE ${MODULES_TABLE}
       SET course_slug = ?, module_slug = ?, updated_at = ?
       WHERE id = ?
       LIMIT 1`,
      [inferred, nextModuleSlug, nowSql(), id]
    );
    updated += 1;
  }
  return { updated };
}

function ident(name) {
  const raw = clean(name, 128);
  if (!/^[a-zA-Z0-9_]+$/.test(raw)) throw new Error("Invalid SQL identifier");
  return `\`${raw}\``;
}

function toSqlDateTime(value) {
  var raw = clean(value, 64);
  if (!raw) return null;
  var d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

async function safeAlter(pool, sql) {
  try {
    await pool.query(sql);
  } catch (error) {
    const msg = String((error && error.message) || "").toLowerCase();
    if (
      msg.indexOf("duplicate column") !== -1 ||
      msg.indexOf("duplicate key name") !== -1 ||
      msg.indexOf("already exists") !== -1 ||
      msg.indexOf("can't drop") !== -1 ||
      msg.indexOf("check that column/key exists") !== -1 ||
      msg.indexOf("unknown column") !== -1
    ) {
      return;
    }
    throw error;
  }
}

async function ensureLearningTables(pool) {
  if (learningTablesEnsured) return;
  if (!runtimeSchemaChangesAllowed()) {
    learningTablesEnsured = true;
    return;
  }
  if (learningTablesEnsurePromise) {
    await learningTablesEnsurePromise;
    return;
  }

  learningTablesEnsurePromise = (async function () {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${COURSES_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      course_slug VARCHAR(120) NOT NULL,
      course_title VARCHAR(220) NOT NULL,
      course_description TEXT NULL,
      is_published TINYINT(1) NOT NULL DEFAULT 0,
      release_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tochukwu_learning_course_slug (course_slug),
      KEY idx_tochukwu_learning_course_publish (is_published, release_at, course_slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await safeAlter(pool, `ALTER TABLE ${COURSES_TABLE} ENGINE=InnoDB`);
  await safeAlter(pool, `ALTER TABLE ${COURSES_TABLE} ADD COLUMN course_slug VARCHAR(120) NOT NULL`);
  await safeAlter(pool, `ALTER TABLE ${COURSES_TABLE} ADD COLUMN course_title VARCHAR(220) NOT NULL`);
  await safeAlter(pool, `ALTER TABLE ${COURSES_TABLE} ADD COLUMN course_description TEXT NULL`);
  await safeAlter(pool, `ALTER TABLE ${COURSES_TABLE} ADD COLUMN is_published TINYINT(1) NOT NULL DEFAULT 0`);
  await safeAlter(pool, `ALTER TABLE ${COURSES_TABLE} ADD COLUMN release_at DATETIME NULL`);
  await safeAlter(pool, `ALTER TABLE ${COURSES_TABLE} ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`);
  await safeAlter(pool, `ALTER TABLE ${COURSES_TABLE} ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`);
  await safeAlter(pool, `ALTER TABLE ${COURSES_TABLE} ADD UNIQUE KEY uniq_tochukwu_learning_course_slug (course_slug)`);
  await safeAlter(pool, `ALTER TABLE ${COURSES_TABLE} ADD KEY idx_tochukwu_learning_course_publish (is_published, release_at, course_slug)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${VIDEO_ASSETS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      provider VARCHAR(60) NOT NULL DEFAULT 'cloudflare_stream',
      video_uid VARCHAR(120) NOT NULL,
      filename VARCHAR(320) NULL,
      hls_url TEXT NULL,
      dash_url TEXT NULL,
      duration_seconds DECIMAL(10,2) NULL,
      ready_to_stream TINYINT(1) NOT NULL DEFAULT 0,
      source_created_at DATETIME NULL,
      source_payload_json LONGTEXT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tochukwu_learning_video_uid (video_uid),
      KEY idx_tochukwu_learning_video_provider (provider, updated_at),
      KEY idx_tochukwu_learning_video_filename (filename(190))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await safeAlter(pool, `ALTER TABLE ${VIDEO_ASSETS_TABLE} ADD COLUMN provider VARCHAR(60) NOT NULL DEFAULT 'cloudflare_stream'`);
  await safeAlter(pool, `ALTER TABLE ${VIDEO_ASSETS_TABLE} ADD COLUMN video_uid VARCHAR(120) NOT NULL`);
  await safeAlter(pool, `ALTER TABLE ${VIDEO_ASSETS_TABLE} ADD COLUMN filename VARCHAR(320) NULL`);
  await safeAlter(pool, `ALTER TABLE ${VIDEO_ASSETS_TABLE} ADD COLUMN hls_url TEXT NULL`);
  await safeAlter(pool, `ALTER TABLE ${VIDEO_ASSETS_TABLE} ADD COLUMN dash_url TEXT NULL`);
  await safeAlter(pool, `ALTER TABLE ${VIDEO_ASSETS_TABLE} ADD COLUMN duration_seconds DECIMAL(10,2) NULL`);
  await safeAlter(pool, `ALTER TABLE ${VIDEO_ASSETS_TABLE} ADD COLUMN ready_to_stream TINYINT(1) NOT NULL DEFAULT 0`);
  await safeAlter(pool, `ALTER TABLE ${VIDEO_ASSETS_TABLE} ADD COLUMN source_created_at DATETIME NULL`);
  await safeAlter(pool, `ALTER TABLE ${VIDEO_ASSETS_TABLE} ADD COLUMN source_payload_json LONGTEXT NULL`);
  await safeAlter(pool, `ALTER TABLE ${VIDEO_ASSETS_TABLE} ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`);
  await safeAlter(pool, `ALTER TABLE ${VIDEO_ASSETS_TABLE} ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`);
  await safeAlter(pool, `ALTER TABLE ${VIDEO_ASSETS_TABLE} ADD UNIQUE KEY uniq_tochukwu_learning_video_uid (video_uid)`);
  await safeAlter(pool, `ALTER TABLE ${VIDEO_ASSETS_TABLE} ADD KEY idx_tochukwu_learning_video_provider (provider, updated_at)`);
  await safeAlter(pool, `ALTER TABLE ${VIDEO_ASSETS_TABLE} ADD KEY idx_tochukwu_learning_video_filename (filename(190))`);
  await safeAlter(pool, `ALTER TABLE ${VIDEO_ASSETS_TABLE} MODIFY COLUMN course_slug VARCHAR(120) NOT NULL DEFAULT ''`);
  await safeAlter(pool, `ALTER TABLE ${VIDEO_ASSETS_TABLE} MODIFY COLUMN module_slug VARCHAR(160) NOT NULL DEFAULT ''`);
  await safeAlter(pool, `ALTER TABLE ${VIDEO_ASSETS_TABLE} MODIFY COLUMN module_title VARCHAR(220) NOT NULL DEFAULT ''`);
  await safeAlter(pool, `ALTER TABLE ${VIDEO_ASSETS_TABLE} MODIFY COLUMN lesson_title VARCHAR(220) NOT NULL DEFAULT ''`);
  await safeAlter(pool, `ALTER TABLE ${VIDEO_ASSETS_TABLE} MODIFY COLUMN lesson_slug VARCHAR(160) NOT NULL DEFAULT ''`);
  await safeAlter(pool, `ALTER TABLE ${VIDEO_ASSETS_TABLE} MODIFY COLUMN lesson_order INT NOT NULL DEFAULT 1`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${MODULES_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      course_slug VARCHAR(120) NOT NULL,
      module_slug VARCHAR(160) NOT NULL,
      module_title VARCHAR(220) NOT NULL,
      module_description TEXT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      drip_enabled TINYINT(1) NOT NULL DEFAULT 0,
      drip_at DATETIME NULL,
      drip_batch_key VARCHAR(64) NULL,
      drip_offset_seconds INT NULL,
      drip_notified_at DATETIME NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tochukwu_learning_module_slug (course_slug, module_slug),
      KEY idx_tochukwu_learning_module_course (course_slug, sort_order, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await safeAlter(pool, `ALTER TABLE ${MODULES_TABLE} ADD COLUMN course_slug VARCHAR(120) NOT NULL`);
  await safeAlter(pool, `ALTER TABLE ${MODULES_TABLE} ADD COLUMN module_slug VARCHAR(160) NOT NULL`);
  await safeAlter(pool, `ALTER TABLE ${MODULES_TABLE} ADD COLUMN module_title VARCHAR(220) NOT NULL`);
  await safeAlter(pool, `ALTER TABLE ${MODULES_TABLE} ADD COLUMN module_description TEXT NULL`);
  await safeAlter(pool, `ALTER TABLE ${MODULES_TABLE} ADD COLUMN sort_order INT NOT NULL DEFAULT 0`);
  await safeAlter(pool, `ALTER TABLE ${MODULES_TABLE} ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1`);
  await safeAlter(pool, `ALTER TABLE ${MODULES_TABLE} ADD COLUMN drip_enabled TINYINT(1) NOT NULL DEFAULT 0`);
  await safeAlter(pool, `ALTER TABLE ${MODULES_TABLE} ADD COLUMN drip_at DATETIME NULL`);
  await safeAlter(pool, `ALTER TABLE ${MODULES_TABLE} ADD COLUMN drip_batch_key VARCHAR(64) NULL`);
  await safeAlter(pool, `ALTER TABLE ${MODULES_TABLE} ADD COLUMN drip_offset_seconds INT NULL`);
  await safeAlter(pool, `ALTER TABLE ${MODULES_TABLE} ADD COLUMN drip_notified_at DATETIME NULL`);
  await safeAlter(pool, `ALTER TABLE ${MODULES_TABLE} ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`);
  await safeAlter(pool, `ALTER TABLE ${MODULES_TABLE} ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`);
  await safeAlter(pool, `ALTER TABLE ${MODULES_TABLE} ADD UNIQUE KEY uniq_tochukwu_learning_module_slug (course_slug, module_slug)`);
  await safeAlter(pool, `ALTER TABLE ${MODULES_TABLE} ADD KEY idx_tochukwu_learning_module_course (course_slug, sort_order, id)`);
  await safeAlter(pool, `ALTER TABLE ${MODULES_TABLE} MODIFY COLUMN course_slug VARCHAR(120) NOT NULL DEFAULT ''`);
  await safeAlter(pool, `ALTER TABLE ${MODULES_TABLE} MODIFY COLUMN module_slug VARCHAR(160) NOT NULL DEFAULT ''`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${MODULE_BATCH_DRIPS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      module_id BIGINT NOT NULL,
      batch_key VARCHAR(64) NOT NULL,
      drip_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_module_batch_drip (module_id, batch_key),
      KEY idx_module_batch_drip_module (module_id),
      KEY idx_module_batch_drip_batch (batch_key),
      CONSTRAINT fk_module_batch_drip_module FOREIGN KEY (module_id) REFERENCES ${MODULES_TABLE}(id) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${LESSONS_TABLE} (
      id BIGINT NOT NULL AUTO_INCREMENT,
      module_id BIGINT NOT NULL,
      lesson_slug VARCHAR(160) NOT NULL,
      lesson_title VARCHAR(220) NOT NULL,
      lesson_order INT NOT NULL DEFAULT 1,
      video_asset_id BIGINT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_tochukwu_learning_lesson_slug (module_id, lesson_slug),
      KEY idx_tochukwu_learning_lesson_module (module_id, lesson_order, id),
      KEY idx_tochukwu_learning_lesson_asset (video_asset_id),
      CONSTRAINT fk_tochukwu_learning_lesson_module FOREIGN KEY (module_id) REFERENCES ${MODULES_TABLE}(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_tochukwu_learning_lesson_asset FOREIGN KEY (video_asset_id) REFERENCES ${VIDEO_ASSETS_TABLE}(id) ON DELETE SET NULL ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await safeAlter(pool, `ALTER TABLE ${LESSONS_TABLE} ADD COLUMN module_id BIGINT NOT NULL`);
  await safeAlter(pool, `ALTER TABLE ${LESSONS_TABLE} ADD COLUMN lesson_slug VARCHAR(160) NOT NULL`);
  await safeAlter(pool, `ALTER TABLE ${LESSONS_TABLE} ADD COLUMN lesson_title VARCHAR(220) NOT NULL`);
  await safeAlter(pool, `ALTER TABLE ${LESSONS_TABLE} ADD COLUMN lesson_order INT NOT NULL DEFAULT 1`);
  await safeAlter(pool, `ALTER TABLE ${LESSONS_TABLE} ADD COLUMN video_asset_id BIGINT NULL`);
  await safeAlter(pool, `ALTER TABLE ${LESSONS_TABLE} ADD COLUMN lesson_notes TEXT NULL`);
  await safeAlter(pool, `ALTER TABLE ${LESSONS_TABLE} ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1`);
  await safeAlter(pool, `ALTER TABLE ${LESSONS_TABLE} ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`);
  await safeAlter(pool, `ALTER TABLE ${LESSONS_TABLE} ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`);
  await safeAlter(pool, `ALTER TABLE ${LESSONS_TABLE} ADD UNIQUE KEY uniq_tochukwu_learning_lesson_slug (module_id, lesson_slug)`);
  await safeAlter(pool, `ALTER TABLE ${LESSONS_TABLE} ADD KEY idx_tochukwu_learning_lesson_module (module_id, lesson_order, id)`);
  await safeAlter(pool, `ALTER TABLE ${LESSONS_TABLE} ADD KEY idx_tochukwu_learning_lesson_asset (video_asset_id)`);

  // Seed configured canonical courses.
  const courseConfigs = listCourseConfigs() || [];
  for (const cfg of courseConfigs) {
    const slug = clean(cfg && cfg.slug, 120).toLowerCase();
    if (!slug) continue;
    const title = clean(cfg && cfg.name, 220) || titleizeSlug(slug) || slug;
    await pool.query(
      `INSERT INTO ${COURSES_TABLE}
        (course_slug, course_title, course_description, is_published, release_at, created_at, updated_at)
       VALUES (?, ?, NULL, 1, NULL, ?, ?)
       ON DUPLICATE KEY UPDATE
        course_title = VALUES(course_title),
        updated_at = VALUES(updated_at)`,
      [slug, title, nowSql(), nowSql()]
    );
  }

  await canonicalizeLegacyModuleCourseSlugs(pool);
  learningTablesEnsured = true;
  })();

  try {
    await learningTablesEnsurePromise;
  } finally {
    learningTablesEnsurePromise = null;
  }
}

async function hasColumn(pool, tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function hasTable(pool, tableName) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = ?
     LIMIT 1`,
    [tableName]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function findTableEngine(pool, tableName) {
  const [rows] = await pool.query(
    `SELECT engine
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = ?
     LIMIT 1`,
    [tableName]
  );
  return rows && rows[0] ? String(rows[0].engine || "").trim() : "";
}

async function findColumnMeta(pool, tableName, columnName) {
  const [rows] = await pool.query(
    `SELECT is_nullable,
            data_type,
            column_type,
            character_maximum_length,
            character_set_name,
            collation_name,
            column_default
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function isTextualDataType(dataType) {
  const type = String(dataType || "").trim().toLowerCase();
  return (
    type === "char" ||
    type === "varchar" ||
    type === "tinytext" ||
    type === "text" ||
    type === "mediumtext" ||
    type === "longtext" ||
    type === "enum" ||
    type === "set"
  );
}

function sqlStringLiteral(value) {
  return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function buildColumnDefaultSql(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isFinite(value)) return ` DEFAULT ${String(value)}`;
  return ` DEFAULT ${sqlStringLiteral(value)}`;
}

async function alignForeignKeyColumnDefinition(pool, input) {
  const tableName = clean(input && input.tableName, 128);
  const columnName = clean(input && input.columnName, 128);
  const referencedTableName = clean(input && input.referencedTableName, 128);
  const referencedColumnName = clean(input && input.referencedColumnName, 128);
  if (!tableName || !columnName || !referencedTableName || !referencedColumnName) {
    throw new Error("table/column names are required");
  }

  const sourceMeta = await findColumnMeta(pool, tableName, columnName);
  const refMeta = await findColumnMeta(pool, referencedTableName, referencedColumnName);
  if (!sourceMeta || !refMeta) return { changed: false, reason: "missing_meta" };

  const sourceType = String(sourceMeta.column_type || sourceMeta.data_type || "").trim().toLowerCase();
  const refType = String(refMeta.column_type || refMeta.data_type || "").trim().toLowerCase();
  const sourceCharset = String(sourceMeta.character_set_name || "").trim().toLowerCase();
  const refCharset = String(refMeta.character_set_name || "").trim().toLowerCase();
  const sourceCollation = String(sourceMeta.collation_name || "").trim().toLowerCase();
  const refCollation = String(refMeta.collation_name || "").trim().toLowerCase();

  const needsTypeAlignment = sourceType !== refType;
  const needsCharsetAlignment = isTextualDataType(refMeta.data_type) && sourceCharset !== refCharset;
  const needsCollationAlignment = isTextualDataType(refMeta.data_type) && sourceCollation !== refCollation;
  if (!needsTypeAlignment && !needsCharsetAlignment && !needsCollationAlignment) {
    return { changed: false, reason: "already_aligned" };
  }

  const nullable = String(sourceMeta.is_nullable || "").toUpperCase() === "YES";
  const nullSql = nullable ? "NULL" : "NOT NULL";
  const defaultSql = buildColumnDefaultSql(sourceMeta.column_default);
  const charsetSql = isTextualDataType(refMeta.data_type) && refMeta.character_set_name
    ? ` CHARACTER SET ${refMeta.character_set_name}`
    : "";
  const collationSql = isTextualDataType(refMeta.data_type) && refMeta.collation_name
    ? ` COLLATE ${refMeta.collation_name}`
    : "";

  await pool.query(
    `ALTER TABLE ${ident(tableName)}
     MODIFY COLUMN ${ident(columnName)} ${refMeta.column_type}${charsetSql}${collationSql} ${nullSql}${defaultSql}`
  );

  return { changed: true };
}

async function hasConstraint(pool, tableName, constraintName) {
  const [rows] = await pool.query(
    `SELECT 1
     FROM information_schema.table_constraints
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND constraint_name = ?
       AND constraint_type = 'FOREIGN KEY'
     LIMIT 1`,
    [tableName, constraintName]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function ensureCourseSlugForeignKey(pool, input) {
  const tableName = clean(input && input.tableName, 128);
  const columnName = clean(input && input.columnName, 128);
  const constraintName = clean(input && input.constraintName, 128);
  if (!tableName || !columnName || !constraintName) {
    throw new Error("tableName, columnName, and constraintName are required");
  }

  const [coursesReady, childReady] = await Promise.all([
    hasTable(pool, COURSES_TABLE),
    hasTable(pool, tableName),
  ]);
  if (!coursesReady || !childReady) return { skipped: true, reason: "table_missing" };

  const columnMeta = await findColumnMeta(pool, tableName, columnName);
  if (!columnMeta) return { skipped: true, reason: "column_missing" };

  const refMeta = await findColumnMeta(pool, COURSES_TABLE, "course_slug");
  if (!refMeta) return { skipped: true, reason: "referenced_column_missing" };

  await alignForeignKeyColumnDefinition(pool, {
    tableName,
    columnName,
    referencedTableName: COURSES_TABLE,
    referencedColumnName: "course_slug",
  });

  if (await hasConstraint(pool, tableName, constraintName)) {
    return { added: false, reason: "exists" };
  }

  const qt = ident(tableName);
  const qc = ident(columnName);
  const qconstraint = ident(constraintName);
  const qcourses = ident(COURSES_TABLE);
  const nullable = String(columnMeta.is_nullable || "").toUpperCase() === "YES";

  if (nullable) {
    await pool.query(
      `UPDATE ${qt}
       SET ${qc} = NULL
       WHERE ${qc} IS NOT NULL
         AND TRIM(${qc}) = ''`
    );
  }

  if (!nullable) {
    const [blankRows] = await pool.query(
      `SELECT COUNT(*) AS blank_count
       FROM ${qt}
       WHERE TRIM(${qc}) = ''`
    );
    const blankCount = Number(blankRows && blankRows[0] && blankRows[0].blank_count || 0);
    if (blankCount > 0) {
      throw new Error(`Cannot add FK ${constraintName}: found ${blankCount} blank ${tableName}.${columnName} values.`);
    }
  }

  const [orphanRows] = await pool.query(
    `SELECT COUNT(*) AS orphan_count
     FROM ${qt} t
     LEFT JOIN ${qcourses} c
       ON c.course_slug = t.${qc}
     WHERE t.${qc} IS NOT NULL
       AND TRIM(t.${qc}) <> ''
       AND c.id IS NULL`
  );
  const orphanCount = Number(orphanRows && orphanRows[0] && orphanRows[0].orphan_count || 0);
  if (orphanCount > 0) {
    throw new Error(`Cannot add FK ${constraintName}: found ${orphanCount} orphan ${tableName}.${columnName} values.`);
  }

  try {
    await pool.query(
      `ALTER TABLE ${qt}
       ADD CONSTRAINT ${qconstraint}
       FOREIGN KEY (${qc}) REFERENCES ${qcourses}(course_slug)
       ON DELETE RESTRICT
       ON UPDATE CASCADE`
    );
  } catch (error) {
    const msg = String((error && error.message) || "").toLowerCase();
    if (
      msg.indexOf("duplicate") !== -1 ||
      msg.indexOf("already exists") !== -1
    ) {
      return { added: false, reason: "exists" };
    }
    if (msg.indexOf("incompatible") !== -1) {
      const [childMetaNow, refMetaNow, childEngine, refEngine] = await Promise.all([
        findColumnMeta(pool, tableName, columnName),
        findColumnMeta(pool, COURSES_TABLE, "course_slug"),
        findTableEngine(pool, tableName),
        findTableEngine(pool, COURSES_TABLE),
      ]);
      throw new Error(
        `FK ${constraintName} incompatible: ` +
          `${tableName}.${columnName}=` +
          `${String(childMetaNow && childMetaNow.column_type || "")} ` +
          `${String(childMetaNow && childMetaNow.character_set_name || "")}/` +
          `${String(childMetaNow && childMetaNow.collation_name || "")} ` +
          `nullable=${String(childMetaNow && childMetaNow.is_nullable || "")} ` +
          `engine=${childEngine}; ` +
          `${COURSES_TABLE}.course_slug=` +
          `${String(refMetaNow && refMetaNow.column_type || "")} ` +
          `${String(refMetaNow && refMetaNow.character_set_name || "")}/` +
          `${String(refMetaNow && refMetaNow.collation_name || "")} ` +
          `nullable=${String(refMetaNow && refMetaNow.is_nullable || "")} ` +
          `engine=${refEngine}`
      );
    }
    throw error;
  }

  return { added: true };
}

async function backfillLearningFromLegacyAssetColumns(pool) {
  const hasCourse = await hasColumn(pool, VIDEO_ASSETS_TABLE, "course_slug");
  const hasModuleTitle = await hasColumn(pool, VIDEO_ASSETS_TABLE, "module_title");
  const hasModuleSlug = await hasColumn(pool, VIDEO_ASSETS_TABLE, "module_slug");
  const hasLessonTitle = await hasColumn(pool, VIDEO_ASSETS_TABLE, "lesson_title");
  const hasLessonSlug = await hasColumn(pool, VIDEO_ASSETS_TABLE, "lesson_slug");
  const hasLessonOrder = await hasColumn(pool, VIDEO_ASSETS_TABLE, "lesson_order");
  if (!hasCourse || !hasModuleTitle || !hasLessonTitle) return { migrated: 0 };

  const selectCols = [
    "id",
    "video_uid",
    "filename",
    "hls_url",
    "dash_url",
    "course_slug",
    "module_title",
    hasModuleSlug ? "module_slug" : "NULL AS module_slug",
    "lesson_title",
    hasLessonSlug ? "lesson_slug" : "NULL AS lesson_slug",
    hasLessonOrder ? "lesson_order" : "NULL AS lesson_order",
  ];

  const [rows] = await pool.query(
    `SELECT ${selectCols.join(", ")}
     FROM ${VIDEO_ASSETS_TABLE}
     WHERE COALESCE(TRIM(course_slug), '') <> ''
       AND COALESCE(TRIM(module_title), '') <> ''
       AND COALESCE(TRIM(lesson_title), '') <> ''
     ORDER BY id ASC`
  );
  if (!Array.isArray(rows) || !rows.length) return { migrated: 0 };

  let migrated = 0;
  const moduleCache = new Map();

  for (const row of rows) {
    const courseSlug = clean(row.course_slug, 120).toLowerCase();
    const moduleTitle = clean(row.module_title, 220);
    const lessonTitle = clean(row.lesson_title, 220);
    if (!courseSlug || !moduleTitle || !lessonTitle) continue;

    const moduleKey = `${courseSlug}::${moduleTitle}`;
    let module = moduleCache.get(moduleKey);
    if (!module) {
      module = await findOrCreateModule(pool, {
        course_slug: courseSlug,
        module_slug: clean(row.module_slug, 160) || null,
        module_title: moduleTitle,
        sort_order: 0,
        is_active: 1,
      });
      if (!module || !module.id) continue;
      moduleCache.set(moduleKey, module);
    }

    const lessonSlug = slugify(clean(row.lesson_slug, 160) || lessonTitle, "lesson");
    const lessonOrder = Number.isFinite(Number(row.lesson_order)) ? Number(row.lesson_order) : migrated + 1;
    const now = nowSql();
    const [ins] = await pool.query(
      `INSERT IGNORE INTO ${LESSONS_TABLE}
        (module_id, lesson_slug, lesson_title, lesson_order, video_asset_id, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      [Number(module.id), lessonSlug, lessonTitle, lessonOrder, Number(row.id || 0) || null, now, now]
    );
    if (Number(ins && ins.affectedRows || 0) > 0) migrated += 1;
  }

  return { migrated };
}

async function upsertVideoAsset(pool, input) {
  const now = nowSql();
  const uid = clean(input && input.video_uid, 120);
  if (!uid) throw new Error("video_uid is required");

  const provider = clean((input && input.provider) || "cloudflare_stream", 60) || "cloudflare_stream";
  const filename = clean(input && input.filename, 320) || null;
  const hlsUrl = clean(input && input.hls_url, 1000) || null;
  const dashUrl = clean(input && input.dash_url, 1000) || null;
  const duration = input && input.duration_seconds !== undefined && input.duration_seconds !== null
    ? Number(input.duration_seconds)
    : null;
  const ready = Number(input && input.ready_to_stream ? 1 : 0);
  const sourceCreatedAt = toSqlDateTime(input && input.source_created_at);
  const sourcePayload = input && input.source_payload_json ? JSON.stringify(input.source_payload_json) : null;

  await pool.query(
    `INSERT INTO ${VIDEO_ASSETS_TABLE}
      (provider, video_uid, filename, hls_url, dash_url, duration_seconds, ready_to_stream, source_created_at, source_payload_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      provider = VALUES(provider),
      filename = VALUES(filename),
      hls_url = VALUES(hls_url),
      dash_url = VALUES(dash_url),
      duration_seconds = VALUES(duration_seconds),
      ready_to_stream = VALUES(ready_to_stream),
      source_created_at = VALUES(source_created_at),
      source_payload_json = VALUES(source_payload_json),
      updated_at = VALUES(updated_at)`,
    [
      provider,
      uid,
      filename,
      hlsUrl,
      dashUrl,
      Number.isFinite(duration) ? duration : null,
      ready,
      sourceCreatedAt,
      sourcePayload,
      now,
      now,
    ]
  );

  const [rows] = await pool.query(
    `SELECT id, provider, video_uid, filename, hls_url, dash_url, duration_seconds, ready_to_stream, source_created_at, updated_at
     FROM ${VIDEO_ASSETS_TABLE}
     WHERE video_uid = ?
     LIMIT 1`,
    [uid]
  );
  return rows && rows[0] ? rows[0] : null;
}

async function findOrCreateModule(pool, input) {
  const now = nowSql();
  const courseSlug = clean(input && input.course_slug, 120).toLowerCase();
  const moduleTitle = clean(input && input.module_title, 220);
  if (!courseSlug) throw new Error("course_slug is required");
  if (!moduleTitle) throw new Error("module_title is required");

  const moduleDescription = clean(input && input.module_description, 4000) || null;
  const sortOrder = toInt(input && input.sort_order, 0);
  const isActive = Number(input && input.is_active === false ? 0 : 1);
  const preferredSlug = slugify(input && input.module_slug ? input.module_slug : moduleTitle, "module");
  const titleNorm = moduleTitle.toLowerCase().replace(/\s+/g, " ").trim();

  const [existingByTitle] = await pool.query(
    `SELECT id, course_slug, module_slug, module_title, module_description, sort_order, is_active, created_at, updated_at
     FROM ${MODULES_TABLE}
     WHERE course_slug = ? AND LOWER(TRIM(module_title)) = ?
     ORDER BY id ASC
     LIMIT 1`,
    [courseSlug, titleNorm]
  );
  if (Array.isArray(existingByTitle) && existingByTitle.length) {
    const existing = existingByTitle[0];
    const keepSlug = clean(existing.module_slug, 160) || preferredSlug;
    await pool.query(
      `UPDATE ${MODULES_TABLE}
       SET module_slug = ?, module_description = ?, sort_order = ?, is_active = ?, updated_at = ?
       WHERE id = ?
       LIMIT 1`,
      [keepSlug, moduleDescription, sortOrder, isActive, now, Number(existing.id)]
    );
    const [rows] = await pool.query(
      `SELECT id, course_slug, module_slug, module_title, module_description, sort_order, is_active, created_at, updated_at
       FROM ${MODULES_TABLE}
       WHERE id = ?
       LIMIT 1`,
      [Number(existing.id)]
    );
    return rows && rows[0] ? rows[0] : null;
  }

  let moduleSlug = preferredSlug;
  let attempt = 0;
  let done = false;
  while (!done && attempt < 8) {
    attempt += 1;
    try {
      await pool.query(
        `INSERT INTO ${MODULES_TABLE}
          (course_slug, module_slug, module_title, module_description, sort_order, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [courseSlug, moduleSlug, moduleTitle, moduleDescription, sortOrder, isActive, now, now]
      );
      done = true;
    } catch (error) {
      const msg = String(error && error.message || "");
      if (msg.toLowerCase().indexOf("duplicate") === -1) throw error;

      // If another request inserted the same logical module title first,
      // lock onto that row instead of creating slug-suffixed replicas.
      const [titleRows] = await pool.query(
        `SELECT id, course_slug, module_slug, module_title, module_description, sort_order, is_active, created_at, updated_at
         FROM ${MODULES_TABLE}
         WHERE course_slug = ? AND LOWER(TRIM(module_title)) = ?
         ORDER BY id ASC
         LIMIT 1`,
        [courseSlug, titleNorm]
      );
      if (Array.isArray(titleRows) && titleRows.length) {
        moduleSlug = clean(titleRows[0].module_slug, 160) || moduleSlug;
        done = true;
        break;
      }

      const suffix = attempt + 1;
      moduleSlug = `${preferredSlug}-${suffix}`;
    }
  }

  await pool.query(
    `UPDATE ${MODULES_TABLE}
     SET module_title = ?, module_description = ?, sort_order = ?, is_active = ?, updated_at = ?
     WHERE course_slug = ? AND module_slug = ?`,
    [moduleTitle, moduleDescription, sortOrder, isActive, now, courseSlug, moduleSlug]
  );

  const [rows] = await pool.query(
    `SELECT id, course_slug, module_slug, module_title, module_description, sort_order, is_active, created_at, updated_at
     FROM ${MODULES_TABLE}
     WHERE course_slug = ? AND module_slug = ?
     LIMIT 1`,
    [courseSlug, moduleSlug]
  );
  return rows && rows[0] ? rows[0] : null;
}

async function ensureModuleById(pool, moduleId) {
  const [rows] = await pool.query(
    `SELECT id, course_slug, module_slug, module_title, module_description, sort_order, is_active, created_at, updated_at
     FROM ${MODULES_TABLE}
     WHERE id = ?
     LIMIT 1`,
    [Number(moduleId || 0)]
  );
  return rows && rows[0] ? rows[0] : null;
}

async function listLearningCourses(pool) {
  const [rows] = await pool.query(
    `SELECT id,
            course_slug,
            course_title,
            course_description,
            is_published,
            DATE_FORMAT(release_at, '%Y-%m-%d %H:%i:%s') AS release_at,
            created_at,
            updated_at
     FROM ${COURSES_TABLE}
     ORDER BY course_slug ASC, id ASC`
  );
  const configured = configuredCourseSlugs();
  const batchSlugs = new Set();
  try {
    const [batchRows] = await pool.query(
      `SELECT DISTINCT course_slug
       FROM course_batches`
    );
    (Array.isArray(batchRows) ? batchRows : []).forEach(function (row) {
      const slug = clean(row && row.course_slug, 120).toLowerCase();
      if (slug) batchSlugs.add(slug);
    });
  } catch (_error) {
    // course_batches may not exist yet for some contexts; fall back to configured slugs only.
  }

  return (Array.isArray(rows) ? rows : []).filter(function (row) {
    const slug = clean(row && row.course_slug, 120).toLowerCase();
    if (!slug) return false;
    if (!isListableCourseSlug(slug)) return false;
    return configured.has(slug) || batchSlugs.has(slug);
  });
}

async function findLearningCourseBySlug(pool, courseSlug) {
  const slug = clean(courseSlug, 120).toLowerCase();
  if (!slug) return null;
  const [rows] = await pool.query(
    `SELECT id,
            course_slug,
            course_title,
            course_description,
            is_published,
            DATE_FORMAT(release_at, '%Y-%m-%d %H:%i:%s') AS release_at,
            created_at,
            updated_at
     FROM ${COURSES_TABLE}
     WHERE course_slug = ?
     LIMIT 1`,
    [slug]
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function upsertLearningCourse(pool, input) {
  const now = nowSql();
  const id = Number(input && input.id || 0);
  const slug = clean(input && input.course_slug, 120).toLowerCase();
  const title = clean(input && input.course_title, 220) || titleizeSlug(slug) || "Course";
  const description = clean(input && input.course_description, 4000) || null;
  const isPublished = input && (input.is_published === true || Number(input.is_published) === 1) ? 1 : 0;
  const releaseAt = toSqlDateTime(input && input.release_at);

  if (!slug) throw new Error("course_slug is required");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("course_slug must be kebab-case (letters, numbers, hyphens).");
  if (!title) throw new Error("course_title is required");

  if (Number.isFinite(id) && id > 0) {
    await pool.query(
      `UPDATE ${COURSES_TABLE}
       SET course_slug = ?, course_title = ?, course_description = ?, is_published = ?, release_at = ?, updated_at = ?
       WHERE id = ?
       LIMIT 1`,
      [slug, title, description, isPublished, releaseAt, now, id]
    );
    const [rows] = await pool.query(
      `SELECT id,
              course_slug,
              course_title,
              course_description,
              is_published,
              DATE_FORMAT(release_at, '%Y-%m-%d %H:%i:%s') AS release_at,
              created_at,
              updated_at
       FROM ${COURSES_TABLE}
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }

  await pool.query(
    `INSERT INTO ${COURSES_TABLE}
      (course_slug, course_title, course_description, is_published, release_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      course_title = VALUES(course_title),
      course_description = VALUES(course_description),
      is_published = VALUES(is_published),
      release_at = VALUES(release_at),
      updated_at = VALUES(updated_at)`,
    [slug, title, description, isPublished, releaseAt, now, now]
  );
  return findLearningCourseBySlug(pool, slug);
}

async function upsertLesson(pool, input) {
  const now = nowSql();
  const moduleId = Number(input && input.module_id || 0);
  const lessonTitle = clean(input && input.lesson_title, 220);
  if (!Number.isFinite(moduleId) || moduleId <= 0) throw new Error("module_id is required");
  if (!lessonTitle) throw new Error("lesson_title is required");

  const lessonOrder = toInt(input && input.lesson_order, 1);
  const videoAssetId = Number(input && input.video_asset_id || 0);
  const safeVideoAssetId = Number.isFinite(videoAssetId) && videoAssetId > 0 ? videoAssetId : null;
  const lessonNotes = clean(input && input.lesson_notes, 4000) || null;
  const isActive = Number(input && input.is_active === false ? 0 : 1);
  const titleNorm = lessonTitle.toLowerCase().replace(/\s+/g, " ").trim();

  const [existingByTitle] = await pool.query(
    `SELECT id, module_id, lesson_slug
     FROM ${LESSONS_TABLE}
     WHERE module_id = ? AND LOWER(TRIM(lesson_title)) = ?
     ORDER BY id ASC
     LIMIT 1`,
    [moduleId, titleNorm]
  );
  if (Array.isArray(existingByTitle) && existingByTitle.length) {
    const existing = existingByTitle[0];
    const keepSlug = clean(existing.lesson_slug, 160) || slugify(input && input.lesson_slug ? input.lesson_slug : lessonTitle, "lesson");
    await pool.query(
      `UPDATE ${LESSONS_TABLE}
       SET lesson_slug = ?, lesson_title = ?, lesson_order = ?, video_asset_id = ?, lesson_notes = ?, is_active = ?, updated_at = ?
       WHERE id = ?
       LIMIT 1`,
      [keepSlug, lessonTitle, lessonOrder, safeVideoAssetId, lessonNotes, isActive, now, Number(existing.id)]
    );
    const [rows] = await pool.query(
      `SELECT l.id, l.module_id, l.lesson_slug, l.lesson_title, l.lesson_order, l.video_asset_id, l.lesson_notes, l.is_active, l.created_at, l.updated_at,
              a.video_uid, a.filename, a.hls_url, a.dash_url
       FROM ${LESSONS_TABLE} l
       LEFT JOIN ${VIDEO_ASSETS_TABLE} a ON a.id = l.video_asset_id
       WHERE l.id = ?
       LIMIT 1`,
      [Number(existing.id)]
    );
    return rows && rows[0] ? rows[0] : null;
  }

  const baseSlug = slugify(input && input.lesson_slug ? input.lesson_slug : lessonTitle, "lesson");
  let lessonSlug = baseSlug;
  let attempt = 0;
  let done = false;
  while (!done && attempt < 8) {
    attempt += 1;
    try {
      await pool.query(
        `INSERT INTO ${LESSONS_TABLE}
          (module_id, lesson_slug, lesson_title, lesson_order, video_asset_id, lesson_notes, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [moduleId, lessonSlug, lessonTitle, lessonOrder, safeVideoAssetId, lessonNotes, isActive, now, now]
      );
      done = true;
    } catch (error) {
      const msg = String(error && error.message || "");
      if (msg.toLowerCase().indexOf("duplicate") === -1) throw error;

      const [titleRows] = await pool.query(
        `SELECT id, module_id, lesson_slug
         FROM ${LESSONS_TABLE}
         WHERE module_id = ? AND LOWER(TRIM(lesson_title)) = ?
         ORDER BY id ASC
         LIMIT 1`,
        [moduleId, titleNorm]
      );
      if (Array.isArray(titleRows) && titleRows.length) {
        lessonSlug = clean(titleRows[0].lesson_slug, 160) || lessonSlug;
        done = true;
        break;
      }

      const suffix = attempt + 1;
      lessonSlug = `${baseSlug}-${suffix}`;
    }
  }

  await pool.query(
    `UPDATE ${LESSONS_TABLE}
     SET lesson_title = ?, lesson_order = ?, video_asset_id = ?, lesson_notes = ?, is_active = ?, updated_at = ?
     WHERE module_id = ? AND lesson_slug = ?`,
    [lessonTitle, lessonOrder, safeVideoAssetId, lessonNotes, isActive, now, moduleId, lessonSlug]
  );

  const [rows] = await pool.query(
    `SELECT l.id, l.module_id, l.lesson_slug, l.lesson_title, l.lesson_order, l.video_asset_id, l.lesson_notes, l.is_active, l.created_at, l.updated_at,
            a.video_uid, a.filename, a.hls_url, a.dash_url
     FROM ${LESSONS_TABLE} l
     LEFT JOIN ${VIDEO_ASSETS_TABLE} a ON a.id = l.video_asset_id
     WHERE l.module_id = ? AND l.lesson_slug = ?
     LIMIT 1`,
    [moduleId, lessonSlug]
  );
  return rows && rows[0] ? rows[0] : null;
}

module.exports = {
  COURSES_TABLE,
  VIDEO_ASSETS_TABLE,
  MODULES_TABLE,
  MODULE_BATCH_DRIPS_TABLE,
  LESSONS_TABLE,
  clean,
  slugify,
  toInt,
  ensureLearningTables,
  upsertVideoAsset,
  findOrCreateModule,
  ensureModuleById,
  listLearningCourses,
  isListableCourseSlug,
  findLearningCourseBySlug,
  upsertLearningCourse,
  upsertLesson,
  backfillLearningFromLegacyAssetColumns,
  ensureCourseSlugForeignKey,
};
