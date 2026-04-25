const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const {
  ensureSchoolCallTablesTochukwu,
  buildCandidateSlots,
  fetchActiveBookedSlotMap,
  SCHOOL_CALL_TIMEZONE,
} = require("./_lib/school-calls-tochukwu");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();

  const pool = getPool();
  try {
    try {
      await applyRuntimeSettings(pool);
    } catch (_error) {}

    await ensureSchoolCallTablesTochukwu(pool);

    const candidates = buildCandidateSlots({ days: 21, durationMinutes: 30 });
    const booked = await fetchActiveBookedSlotMap(pool);
    const available = candidates.filter((slot) => !booked.has(slot.startIso));

    return json(200, {
      ok: true,
      timezone: SCHOOL_CALL_TIMEZONE,
      durationMinutes: 30,
      slots: available.slice(0, 60),
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not load slots" });
  }
};
