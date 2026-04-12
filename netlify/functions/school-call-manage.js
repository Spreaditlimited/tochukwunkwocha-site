const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const {
  SCHOOL_CALL_BOOKINGS_TABLE,
  ensureSchoolCallTablesTochukwu,
  clean,
  toPublicBookingRow,
} = require("./_lib/school-calls-tochukwu");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const token = clean((event.queryStringParameters && event.queryStringParameters.manage) || "", 128);
  if (!token) return json(400, { ok: false, error: "Missing manage token" });

  const pool = getPool();
  try {
    try {
      await applyRuntimeSettings(pool);
    } catch (_error) {}

    await ensureSchoolCallTablesTochukwu(pool);

    const [rows] = await pool.query(
      `SELECT * FROM ${SCHOOL_CALL_BOOKINGS_TABLE} WHERE manage_token = ? LIMIT 1`,
      [token]
    );

    if (!rows || !rows.length) return json(404, { ok: false, error: "Booking not found" });

    const booking = toPublicBookingRow(rows[0]);
    return json(200, { ok: true, booking });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load booking" });
  }
};
