const { json, badMethod } = require("./_lib/http");
const { Document, Packer, Paragraph, HeadingLevel, TextRun } = require("docx");
const { getPool } = require("./_lib/db");
const { ensureStudentAuthTables, requireStudentSession } = require("./_lib/user-auth");
const { ensureBusinessPlanTables, findPlanByUuidForAccount } = require("./_lib/business-plans");

function parseJsonBody(rawBody) {
  try {
    return JSON.parse(rawBody || "{}");
  } catch (_error) {
    return null;
  }
}

function makeSafeFileName(name) {
  const base = String(name || "business-plan")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .slice(0, 60)
    .toLowerCase();
  return base || "business-plan";
}

function parsePlanToParagraphs(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      blocks.push(new Paragraph({ text: "" }));
      continue;
    }
    if (line.startsWith("### ")) {
      blocks.push(new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3 }));
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 }));
      continue;
    }
    if (line.startsWith("# ")) {
      blocks.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 }));
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      blocks.push(new Paragraph({ text: line.replace(/^[-*]\s+/, "• ") }));
      continue;
    }
    blocks.push(new Paragraph({ text: line.replace(/\*\*(.+?)\*\*/g, "$1") }));
  }
  return blocks;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  const body = parseJsonBody(event.body);
  if (!body) return json(400, { ok: false, error: "Invalid JSON body" });
  const planUuid = String(body.planUuid || "").trim();
  if (!planUuid) return json(400, { ok: false, error: "planUuid is required" });

  const pool = getPool();
  try {
    await ensureStudentAuthTables(pool);
    await ensureBusinessPlanTables(pool);
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    const plan = await findPlanByUuidForAccount(pool, {
      planUuid,
      email: session.account.email,
    });
    if (!plan) return json(404, { ok: false, error: "Business plan not found" });
    if (String(plan.verification_status || "").toLowerCase() !== "verified") {
      return json(403, { ok: false, error: "Business plan is awaiting verification" });
    }

    const fileName = makeSafeFileName(plan.business_name || "business-plan");
    const stamp = new Paragraph({
      children: [new TextRun({ text: "VERIFIED BY TOCHUKWU NKWOCHA TEAM", bold: true })],
    });
    const verifiedAt = plan.verified_at ? new Date(plan.verified_at).toLocaleString() : "";
    const stampDate = new Paragraph({
      children: [new TextRun({ text: verifiedAt ? `Verified at: ${verifiedAt}` : "Verified", italics: true })],
    });

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [stamp, stampDate, new Paragraph({ text: "" }), ...parsePlanToParagraphs(plan.plan_text || "")],
        },
      ],
    });
    const buffer = await Packer.toBuffer(doc);
    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename=\"${fileName}.docx\"`,
        "Cache-Control": "no-store",
      },
      body: buffer.toString("base64"),
    };
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not export file." });
  }
};
