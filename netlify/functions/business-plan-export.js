const { json, badMethod } = require("./_lib/http");
const { Document, Packer, Paragraph, HeadingLevel } = require("docx");

function parseJsonBody(rawBody) {
  try {
    return JSON.parse(rawBody || "{}");
  } catch (_error) {
    return null;
  }
}

function makeSafeFileName(name) {
  const base = String(name || "linescout-business-plan")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .slice(0, 60)
    .toLowerCase();
  return base || "linescout-business-plan";
}

function parsePlanToParagraphs(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];

  lines.forEach(function (rawLine) {
    const line = rawLine.trim();
    if (!line) {
      blocks.push(new Paragraph({ text: "" }));
      return;
    }

    if (line.startsWith("### ")) {
      blocks.push(new Paragraph({ text: line.slice(4), heading: HeadingLevel.HEADING_3 }));
      return;
    }
    if (line.startsWith("## ")) {
      blocks.push(new Paragraph({ text: line.slice(3), heading: HeadingLevel.HEADING_2 }));
      return;
    }
    if (line.startsWith("# ")) {
      blocks.push(new Paragraph({ text: line.slice(2), heading: HeadingLevel.HEADING_1 }));
      return;
    }

    if (/^[-*]\s+/.test(line)) {
      blocks.push(new Paragraph({ text: line.replace(/^[-*]\s+/, "• ") }));
      return;
    }

    blocks.push(new Paragraph({ text: line.replace(/\*\*(.+?)\*\*/g, "$1") }));
  });

  return blocks;
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const body = parseJsonBody(event.body);
  if (!body) return json(400, { ok: false, error: "Invalid JSON body" });

  const planText = String(body.planText || "").trim();
  const format = String(body.format || "docx").trim().toLowerCase();
  const fileName = makeSafeFileName(body.fileName);

  if (!planText) return json(400, { ok: false, error: "planText is required." });
  if (format !== "docx") return json(400, { ok: false, error: "Only docx export is supported." });

  try {
    const doc = new Document({
      sections: [{ properties: {}, children: parsePlanToParagraphs(planText) }],
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
