const { json, badMethod } = require("./_lib/http");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  Footer,
  PageNumber,
} = require("docx");

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

// Upgraded text parser: Captures both ** and __, makes them bold, and strips all remaining markers
function parseTextToRuns(text, isHeader = false) {
  const parts = String(text || "").split(/(\*\*.*?\*\*|__.*?__)/g);
  return parts
    .map((part) => {
      const runProps = { text: part.replace(/[\*_]/g, "") }; 
      
      if (isHeader) {
        runProps.bold = true;
        runProps.color = "FFFFFF"; // White text for table headers
      } else if (
        (part.startsWith("**") && part.endsWith("**")) || 
        (part.startsWith("__") && part.endsWith("__"))
      ) {
        runProps.bold = true;
      }
      return new TextRun(runProps);
    })
    .filter((r) => r.text.length > 0);
}

async function buildDocx(planText, title) {
  const lines = String(planText || "").split(/\r?\n/);

  function splitTableCells(line) {
    return String(line || "")
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
  }

  function isTableLine(line) {
    const trimmed = String(line || "").trim();
    if (!trimmed || !trimmed.includes("|")) return false;
    const cells = splitTableCells(trimmed).filter((cell) => cell.length > 0);
    return cells.length >= 2;
  }

  function parseTableBlock(startIndex) {
    const tableLines = [];
    let i = startIndex;

    while (i < lines.length && isTableLine(lines[i])) {
      tableLines.push(lines[i].trim());
      i += 1;
    }

    const rows = tableLines.map((line) => splitTableCells(line));

    function isSeparatorRow(cells) {
      const nonEmpty = cells.filter((c) => String(c || "").trim().length > 0);
      if (!nonEmpty.length) return false;
      return nonEmpty.every((c) => /^:?-{3,}:?$/.test(c));
    }

    let headerCells = [];
    let dataStartIndex = 0;

    if (rows.length >= 2 && isSeparatorRow(rows[1])) {
      headerCells = rows[0];
      dataStartIndex = 2;
    }

    const tableRows = [];
    let maxCols = rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
    if (maxCols < 2) maxCols = 2;

    function normalizeRow(row) {
      const out = Array.isArray(row) ? row.slice(0, maxCols) : [];
      while (out.length < maxCols) out.push("");
      return out;
    }

    if (headerCells.length > 0) {
      headerCells = normalizeRow(headerCells);
      tableRows.push(
        new TableRow({
          tableHeader: true,
          children: headerCells.map(
            (cell) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: parseTextToRuns(cell, true), 
                    alignment: AlignmentType.LEFT,
                  }),
                ],
                shading: { fill: "1F3864" }, // Deep corporate blue
                margins: { top: 120, bottom: 120, left: 150, right: 150 },
              })
          ),
        })
      );
    }

    for (let r = dataStartIndex; r < rows.length; r += 1) {
      const normalized = normalizeRow(rows[r]);
      const isEven = (r - dataStartIndex) % 2 === 0;
      const rowColor = isEven ? "F3F4F6" : "FFFFFF"; // High-contrast zebra stripes

      tableRows.push(
        new TableRow({
          children: normalized.map(
            (cell) =>
              new TableCell({
                children: [new Paragraph({ children: parseTextToRuns(cell, false) })],
                shading: { fill: rowColor },
                margins: { top: 100, bottom: 100, left: 150, right: 150 },
              })
          ),
        })
      );
    }

    const table = new Table({
      rows: tableRows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: "E5E7EB" },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "E5E7EB" },
        left: { style: BorderStyle.NONE, size: 0, color: "auto" },
        right: { style: BorderStyle.NONE, size: 0, color: "auto" },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "E5E7EB" },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
      },
    });

    return { table: table, nextIndex: i };
  }

  const bodyChildren = [];
  let i = 0;
  let isFirstH1 = true; 

  while (i < lines.length) {
    const rawLine = lines[i];
    const line = String(rawLine || "").trim();

    if (!line) {
      bodyChildren.push(new Paragraph({ text: "" }));
      i += 1;
      continue;
    }

    if (line.match(/^[-*_]{3,}$/)) {
      bodyChildren.push(
        new Paragraph({
          text: "",
          borders: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "E5E7EB" } },
          spacing: { after: 200 },
        })
      );
      i += 1;
      continue;
    }

    if (isTableLine(line)) {
      const parsed = parseTableBlock(i);
      bodyChildren.push(parsed.table);
      bodyChildren.push(new Paragraph({ text: "" }));
      i = parsed.nextIndex;
      continue;
    }

    // Explicit Page Breaks for Headings
    if (line.startsWith("# ")) {
      if (!isFirstH1) {
        // Hardcoded page break before non-first H1s to ensure it triggers correctly
        bodyChildren.push(new Paragraph({ pageBreakBefore: true, text: "" }));
      }
      bodyChildren.push(
        new Paragraph({
          children: parseTextToRuns(line.replace(/^#\s+/, "")),
          heading: HeadingLevel.HEADING_1,
        })
      );
      isFirstH1 = false;
      i += 1;
      continue;
    }

    if (line.startsWith("## ")) {
      bodyChildren.push(
        new Paragraph({
          children: parseTextToRuns(line.replace(/^##\s+/, "")),
          heading: HeadingLevel.HEADING_2,
        })
      );
      i += 1;
      continue;
    }

    if (line.startsWith("### ")) {
      bodyChildren.push(
        new Paragraph({
          children: parseTextToRuns(line.replace(/^###\s+/, "")),
          heading: HeadingLevel.HEADING_3,
        })
      );
      i += 1;
      continue;
    }

    if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• ")) {
      const text = line.replace(/^([-*]|•)\s+/, "");
      bodyChildren.push(
        new Paragraph({
          children: parseTextToRuns(text),
          bullet: { level: 0 },
        })
      );
      i += 1;
      continue;
    }

    const numberedMatch = line.match(/^(\d+)[\.\)]\s+(.*)$/);
    if (numberedMatch) {
      bodyChildren.push(
        new Paragraph({
          children: [
            new TextRun({ text: numberedMatch[1] + ". ", bold: true }),
            ...parseTextToRuns(numberedMatch[2]),
          ],
        })
      );
      i += 1;
      continue;
    }

    bodyChildren.push(
      new Paragraph({
        children: parseTextToRuns(line),
      })
    );
    i += 1;
  }

  const safeTitle = title && String(title).trim().length > 0 ? String(title).trim() : "Business Plan";

  const coverChildren = [
    new Paragraph({ text: "", spacing: { before: 2000 } }), 
    new Paragraph({
      children: [new TextRun({ text: safeTitle, size: 56, bold: true, color: "1F3864" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "CONFIDENTIAL BUSINESS PLAN", size: 24, color: "6B7280", bold: true })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 1200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: "Prepared with LineScout", size: 22, color: "9CA3AF" })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({ 
          text: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 
          size: 22, color: "9CA3AF" 
        })
      ],
      alignment: AlignmentType.CENTER,
    }),
  ];

  const pageBreakPara = new Paragraph({ pageBreakBefore: true, text: "" });

  const footer = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            font: "Calibri",
            size: 18,
            color: "9CA3AF",
            children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES],
          }),
        ],
      }),
    ],
  });

  // CORRECTED STYLES SCHEMA
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22, color: "333333" },
          paragraph: { spacing: { line: 320, before: 100, after: 100 } },
        },
      },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          run: { font: "Arial", size: 36, bold: true, color: "1F3864" },
          paragraph: { spacing: { before: 400, after: 200 } },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          run: { font: "Arial", size: 28, bold: true, color: "2E74B5" },
          paragraph: { spacing: { before: 300, after: 150 } },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Normal",
          run: { font: "Arial", size: 24, bold: true, color: "404040" },
          paragraph: { spacing: { before: 200, after: 100 } },
        },
      ],
    },
    sections: [
      {
        properties: {},
        footers: {
          default: footer,
        },
        children: [].concat(coverChildren, [pageBreakPara], bodyChildren),
      },
    ],
  });

  return Packer.toBuffer(doc);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const body = parseJsonBody(event.body);
  if (!body) return json(400, { ok: false, error: "Invalid JSON body" });

  const planText = String(body.planText || "");
  const format = String(body.format || "docx").trim().toLowerCase();
  const fileName = makeSafeFileName(body.fileName);

  if (!planText.trim()) return json(400, { ok: false, error: "planText is required." });
  if (format !== "docx") return json(400, { ok: false, error: "Only docx export is supported." });

  try {
    const titleLine = String(planText.split(/\r?\n/)[0] || "").replace(/^#\s*/, "").trim();
    const docBuffer = await buildDocx(planText, titleLine || fileName);

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename=\"${fileName}.docx\"`,
        "Cache-Control": "no-store",
      },
      body: Buffer.from(docBuffer).toString("base64"),
    };
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not export file." });
  }
};