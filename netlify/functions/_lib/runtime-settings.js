const { ensureAdminSettingsTable, listAdminSettings, SETTINGS_DEFINITIONS } = require("./admin-settings");

const PROTECTED_KEYS = new Set(["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"]);
const BASELINE_VALUES = new Map();
for (const def of SETTINGS_DEFINITIONS) {
  BASELINE_VALUES.set(def.key, String(process.env[def.key] || ""));
}

let lastAppliedAtMs = 0;
let lastHash = "";

function clean(value, max) {
  return String(value || "").trim().slice(0, max);
}

function ttlMs() {
  const raw = Number(process.env.TOCHUKWU_SETTINGS_CACHE_TTL_MS || 30000);
  if (!Number.isFinite(raw) || raw < 1000) return 30000;
  return Math.min(raw, 5 * 60 * 1000);
}

function computeHash(rows) {
  return JSON.stringify(
    (rows || [])
      .map((row) => ({
        key: clean(row.setting_key, 120),
        value: clean(row.setting_value, 5000),
      }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  );
}

function applyRowsToProcessEnv(rows) {
  const rowMap = new Map();
  for (const row of rows || []) {
    const key = clean(row.setting_key, 120);
    const value = clean(row.setting_value, 5000);
    if (!key || !value) continue;
    rowMap.set(key, value);
  }

  for (const def of SETTINGS_DEFINITIONS) {
    const key = def.key;
    if (PROTECTED_KEYS.has(key)) continue;
    const overrideValue = rowMap.get(key) || "";
    if (overrideValue) {
      process.env[key] = overrideValue;
      continue;
    }

    const baseline = BASELINE_VALUES.get(key) || "";
    if (baseline) {
      process.env[key] = baseline;
    } else {
      delete process.env[key];
    }
  }
}

async function applyRuntimeSettings(pool, input) {
  const force = Boolean(input && input.force);
  const now = Date.now();
  if (!force && now - lastAppliedAtMs < ttlMs()) return;

  await ensureAdminSettingsTable(pool);
  const rows = await listAdminSettings(pool);
  const hash = computeHash(rows);
  if (!force && hash === lastHash) {
    lastAppliedAtMs = now;
    return;
  }

  applyRowsToProcessEnv(rows);
  lastHash = hash;
  lastAppliedAtMs = now;
}

module.exports = {
  applyRuntimeSettings,
};
