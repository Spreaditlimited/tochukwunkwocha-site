function truthy(value) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function runtimeSchemaChangesAllowed() {
  return truthy(process.env.DB_ALLOW_RUNTIME_DDL) || truthy(process.env.DB_MIGRATION_MODE);
}

module.exports = {
  runtimeSchemaChangesAllowed,
};
