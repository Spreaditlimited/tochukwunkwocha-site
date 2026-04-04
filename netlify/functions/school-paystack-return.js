const { getPool } = require("./_lib/db");
const { siteBaseUrl, paystackVerifyTransaction } = require("./_lib/payments");
const { sendEmail } = require("./_lib/email");
const {
  ensureSchoolTables,
  markSchoolOrderPaidBy,
  createSchoolAdminSession,
  setSchoolAdminCookieHeader,
} = require("./_lib/schools");

function buildSchoolWelcomeEmail(input) {
  const fullName = String((input && input.fullName) || "School Admin").trim();
  const email = String((input && input.email) || "").trim();
  const tempPassword = String((input && input.tempPassword) || "").trim();
  const dashboardUrl = `${siteBaseUrl()}/schools/dashboard/`;
  const html = [
    `<p>Hello ${fullName},</p>`,
    `<p>Your school access to Prompt to Profit is now active.</p>`,
    `<p><strong>Admin Email:</strong> ${email}</p>`,
    tempPassword ? `<p><strong>Temporary Password:</strong> <code>${tempPassword}</code></p>` : "",
    `<p>Open your school dashboard: <a href="${dashboardUrl}">${dashboardUrl}</a></p>`,
  ].join("\n");
  const text = [
    `Hello ${fullName},`,
    "Your school access to Prompt to Profit is now active.",
    `Admin Email: ${email}`,
    tempPassword ? `Temporary Password: ${tempPassword}` : "",
    `School dashboard: ${dashboardUrl}`,
  ].filter(Boolean).join("\n");
  return { html, text };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  const qs = event.queryStringParameters || {};
  const reference = String(qs.reference || qs.trxref || "").trim();
  if (!reference) {
    return {
      statusCode: 302,
      headers: { Location: `${siteBaseUrl()}/schools/register/?payment=failed` },
      body: "",
    };
  }

  const pool = getPool();
  try {
    await ensureSchoolTables(pool);
    const tx = await paystackVerifyTransaction(reference);
    if (String(tx && tx.status || "").toLowerCase() !== "success") {
      return {
        statusCode: 302,
        headers: { Location: `${siteBaseUrl()}/schools/register/?payment=failed` },
        body: "",
      };
    }

    const orderUuid = String(tx && tx.metadata && tx.metadata.school_order_uuid || "").trim();
    const result = await markSchoolOrderPaidBy(pool, {
      provider: "paystack",
      providerReference: reference,
      providerOrderId: tx && tx.id ? String(tx.id) : "",
      orderUuid: orderUuid || "",
    });
    if (!result.ok) throw new Error(result.error || "Could not mark school order paid");

    const token = await createSchoolAdminSession(pool, Number(result.adminId));
    const setCookie = setSchoolAdminCookieHeader(event, token);

    try {
      const mail = buildSchoolWelcomeEmail({
        fullName: result.adminName,
        email: result.adminEmail,
        tempPassword: result.tempPassword,
      });
      await sendEmail({
        to: result.adminEmail,
        subject: "School Dashboard Access Activated",
        html: mail.html,
        text: mail.text,
      });
    } catch (_error) {}

    return {
      statusCode: 302,
      headers: {
        Location: `${siteBaseUrl()}/schools/dashboard/`,
        "Set-Cookie": setCookie,
      },
      body: "",
    };
  } catch (_error) {
    return {
      statusCode: 302,
      headers: { Location: `${siteBaseUrl()}/schools/register/?payment=failed` },
      body: "",
    };
  }
};

