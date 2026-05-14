const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const {
  ensureStudentAuthTables,
  requireStudentSession,
  updateStudentProfileName,
} = require("./_lib/user-auth");
const { normalizePhoneE164 } = require("./_lib/whatsapp");
const { upsertWhatsAppContact, markWhatsAppOptedOut } = require("./_lib/whatsapp-marketing");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const phoneRaw = String(body.phone || "").trim();
    const phoneE164 = phoneRaw ? normalizePhoneE164(phoneRaw) : "";
    const whatsappOptedIn = body.whatsappOptedIn === true;
    if (phoneRaw && !phoneE164) {
      return json(400, { ok: false, error: "Please enter a valid WhatsApp phone number with country code." });
    }
    if (whatsappOptedIn && !phoneE164) {
      return json(400, { ok: false, error: "WhatsApp opt-in requires a valid phone number." });
    }

    const account = await updateStudentProfileName(pool, {
      accountId: Number(session.account.id),
      fullName: body.fullName,
      phoneE164,
      whatsappOptedIn,
    });

    if (whatsappOptedIn && phoneE164) {
      await upsertWhatsAppContact(pool, {
        studentAccountId: Number(session.account.id),
        email: account.email,
        fullName: account.fullName,
        phoneE164,
        source: "student_profile",
        optedIn: true,
        optInVersion: "student_profile_whatsapp_v1",
      }).catch(function (error) {
        console.error("profile_whatsapp_contact_upsert_failed", error && error.message ? error.message : error);
      });
    } else if (!whatsappOptedIn && phoneE164) {
      await markWhatsAppOptedOut(pool, phoneE164).catch(function (error) {
        console.error("profile_whatsapp_contact_optout_failed", error && error.message ? error.message : error);
      });
    }

    return json(200, {
      ok: true,
      profile: {
        accountUuid: account.accountUuid,
        fullName: account.fullName,
        email: account.email,
        phone: account.phone || "",
        whatsappOptedIn: account.whatsappOptedIn === true,
        whatsappOptedInAt: account.whatsappOptedInAt || null,
        whatsappOptedOutAt: account.whatsappOptedOutAt || null,
        certificateNameConfirmedAt: account.certificateNameConfirmedAt || null,
        certificateNameUpdatedAt: account.certificateNameUpdatedAt || null,
        certificateNameNeedsConfirmation: !account.certificateNameConfirmedAt,
      },
      message: "Profile updated.",
    });
  } catch (error) {
    const message = String(error && error.message || "Could not update profile");
    const locked = message.toLowerCase().indexOf("confirmed and locked") !== -1;
    return json(locked ? 409 : 400, { ok: false, error: message });
  }
};
