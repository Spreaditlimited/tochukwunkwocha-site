const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { applyRuntimeSettings } = require("./_lib/runtime-settings");
const { requireAdminSession } = require("./_lib/admin-auth");
const {
  clean,
  listWhatsAppContacts,
  createWhatsAppCampaign,
  updateCampaignN8nStatus,
  sendCampaignToN8n,
} = require("./_lib/whatsapp-marketing");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const auth = requireAdminSession(event);
  if (!auth.ok) return json(auth.statusCode || 401, { ok: false, error: auth.error || "Unauthorized" });

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const campaignName = clean(body.campaignName, 180) || "WhatsApp Campaign";
  const templateName = clean(body.templateName, 120) || "holiday_waitlist_welcome";
  const templateLanguage = clean(body.templateLanguage, 20) || "en";
  const variableMode = clean(body.variableMode, 80) || "recipient_full_name";
  const templatePreview = clean(body.templatePreview, 4000) ||
    "Hi {{1}}, thanks for joining the Prompt to Profit Holiday VIP waitlist. As requested, we will keep you updated as the holiday approaches so you can secure your child’s spot. Meanwhile, how old is your child?";
  const courseSlug = clean(body.courseSlug || "all", 120).toLowerCase() || "all";
  const testPhone = clean(body.testPhone, 40);
  const sendTest = body.sendTest === true;
  if (!templateName) return json(400, { ok: false, error: "Template name is required." });

  const pool = getPool();
  try { await applyRuntimeSettings(pool); } catch (_error) {}

  try {
    let recipients = [];
    if (sendTest) {
      if (!testPhone) return json(400, { ok: false, error: "Test phone number is required." });
      recipients = [{ fullName: "Test Recipient", email: "", phone: testPhone, courseSlug: "test" }];
    } else {
      const contacts = await listWhatsAppContacts(pool, { courseSlug, opted: "in", limit: 1000 });
      recipients = contacts.map(function (row) {
        return {
          fullName: clean(row.full_name, 180),
          email: clean(row.email, 190).toLowerCase(),
          phone: clean(row.phone_e164, 20),
          courseSlug: clean(row.course_slug, 120),
        };
      }).filter(function (item) { return !!item.phone; });
      if (!recipients.length) return json(400, { ok: false, error: "No opted-in WhatsApp contacts matched this audience." });
    }

    const campaignUuid = await createWhatsAppCampaign(pool, {
      campaignName,
      courseSlug: sendTest ? "test" : courseSlug,
      messageText: templatePreview,
      recipients,
      createdBy: (auth.payload && (auth.payload.email || auth.payload.fullName)) || "admin",
    });

    const payload = {
      source: sendTest ? "admin_whatsapp_campaign_test" : "admin_whatsapp_campaign",
      campaignId: campaignUuid,
      campaignName,
      templateName,
      templateLanguage,
      templatePreview,
      variableMode,
      variables: [
        {
          index: 1,
          source: "recipient.fullName",
          fallback: "there",
        },
      ],
      courseSlug: sendTest ? "test" : courseSlug,
      submittedAt: new Date().toISOString(),
      recipients: recipients.map(function (recipient) {
        const fullName = clean(recipient && recipient.fullName, 180) || "there";
        return Object.assign({}, recipient, {
          templateVariables: [fullName],
        });
      }),
    };

    const n8n = await sendCampaignToN8n({ payload });
    if (!n8n || !n8n.ok) {
      const error = clean(n8n && n8n.error, 500) || "n8n webhook failed";
      await updateCampaignN8nStatus(pool, campaignUuid, "failed", error);
      return json(502, { ok: false, error, campaignId: campaignUuid, recipientCount: recipients.length });
    }

    await updateCampaignN8nStatus(pool, campaignUuid, "sent_to_n8n", "");
    return json(200, { ok: true, campaignId: campaignUuid, recipientCount: recipients.length });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not send WhatsApp campaign" });
  }
};
