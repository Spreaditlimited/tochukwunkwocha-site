import { NextResponse } from "next/server";
import {
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
} from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function makeSafeFileName(name: string | undefined | null): string {
  const base = (name || "linescout-business-plan")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .slice(0, 60)
    .toLowerCase();
  return base || "linescout-business-plan";
}

// Replace characters that pdf-lib's WinAnsi encoding cannot handle
function sanitizeForPdf(text: string): string {
  return text
    // curly single quotes -> '
    .replace(/[\u2018\u2019]/g, "'")
    // curly double quotes -> "
    .replace(/[\u201C\u201D]/g, '"')
    // en dash / em dash -> -
    .replace(/[\u2013\u2014]/g, "-")
    // bullet • -> *
    .replace(/\u2022/g, "*")
    // right arrow →  -> ->
    .replace(/\u2192/g, "->")
    // non-breaking space -> normal space
    .replace(/\u00A0/g, " ");
}

// --- Markdown helpers -------------------------------------------------------

function parseMarkdownLines(text: string): { type: string; content: string }[] {
  const lines = text.split(/\r?\n/);
  const parsed: { type: string; content: string }[] = [];

  for (const raw of lines) {
    const line = raw.replace(/\s+$/g, "");

    if (!line.trim()) {
      parsed.push({ type: "blank", content: "" });
      continue;
    }

    if (line.startsWith("### ")) {
      parsed.push({ type: "h3", content: line.slice(4).trim() });
    } else if (line.startsWith("## ")) {
      parsed.push({ type: "h2", content: line.slice(3).trim() });
    } else if (line.startsWith("# ")) {
      parsed.push({ type: "h1", content: line.slice(2).trim() });
    } else if (/^\s*[-*]\s+/.test(line)) {
      parsed.push({
        type: "bullet",
        content: line.replace(/^\s*[-*]\s+/, "").trim(),
      });
    } else if (/^\s*\d+\.\s+/.test(line)) {
      parsed.push({
        type: "numbered",
        content: line.replace(/^\s*\d+\.\s+/, "").trim(),
      });
    } else {
      parsed.push({ type: "para", content: line });
    }
  }

  return parsed;
}

// Remove inline markdown markers so nothing like **text** shows in DOCX
function stripMarkdownEmphasis(text: string): string {
  if (!text) return "";
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`(.+?)`/g, "$1");
}

type DocxBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "table"; rows: string[][] };

// Very small markdown parser focused on headings, bullets, and tables
function parseMarkdownForDocx(markdown: string): DocxBlock[] {
  const blocks: DocxBlock[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let i = 0;

  const headingRe = /^(#{1,3})\s+(.*)$/;
  const bulletRe = /^[-*+]\s+(.*)$/;
  const tableRe = /^\s*\|.*\|\s*$/;

  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      i++;
      continue;
    }

    // Headings: #, ##, ###
    const hm = line.match(headingRe);
    if (hm) {
      const level = hm[1].length as 1 | 2 | 3;
      const text = stripMarkdownEmphasis(hm[2].trim());
      blocks.push({ kind: "heading", level, text });
      i++;
      continue;
    }

    // Bullets: -, *, +
    const bm = line.match(bulletRe);
    if (bm) {
      const text = stripMarkdownEmphasis(bm[1].trim());
      blocks.push({ kind: "bullet", text });
      i++;
      continue;
    }

    // Tables: markdown rows starting with |
    if (tableRe.test(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && tableRe.test(lines[i].trim())) {
        tableLines.push(lines[i].trim());
        i++;
      }

      const rows: string[][] = tableLines.map((l) =>
        l
          .split("|")
          .map((c) => c.trim())
          .filter((c) => c.length > 0),
      );

      // Remove separator row like |---|---|
      if (
        rows.length > 1 &&
        rows[1].every((cell) => /^:?-{3,}:?$/.test(cell))
      ) {
        rows.splice(1, 1);
      }

      if (rows.length) {
        const cleanRows = rows.map((r) => r.map(stripMarkdownEmphasis));
        blocks.push({ kind: "table", rows: cleanRows });
      }
      continue;
    }

    // Paragraph: gather until blank or next structural element
    const paraLines = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i];
      const t = next.trim();
      if (!t) break;
      if (headingRe.test(t) || bulletRe.test(t) || tableRe.test(t)) break;
      paraLines.push(t);
      i++;
    }
    const text = stripMarkdownEmphasis(paraLines.join(" "));
    blocks.push({ kind: "paragraph", text });
  }

  return blocks;
}

// --- DOCX builder -----------------------------------------------------------

async function buildDocx(planText: string, title: string) {
  // 1) Clean up basic markdown emphasis so we don't see ** in the DOCX
  const cleanedText = planText
    .replace(/\*\*(.+?)\*\*/g, "$1") // **bold** -> bold
    .replace(/__(.+?)__/g, "$1");    // __bold__ -> bold

  const lines = cleanedText.split(/\r?\n/);

  // 2) Helpers to detect tables and build Word objects

  function isTableLine(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|");
  }

  function parseTableBlock(startIndex: number) {
    const tableLines: string[] = [];
    let i = startIndex;

    while (i < lines.length && isTableLine(lines[i])) {
      tableLines.push(lines[i].trim());
      i++;
    }

    // Convert lines like "| a | b | c |" into [["a","b","c"], ...]
    const rows = tableLines.map((line) =>
      line
        .slice(1, -1) // remove leading and trailing |
        .split("|")
        .map((cell) => cell.trim())
    );

    // Detect header separator row like | --- | --- |
    const isSeparatorRow = (cells: string[]) =>
      cells.every((c) => /^:?-{3,}:?$/.test(c));

    let headerCells: string[] = [];
    let dataStartIndex = 0;

    if (rows.length >= 2 && isSeparatorRow(rows[1])) {
      headerCells = rows[0];
      dataStartIndex = 2;
    } else {
      dataStartIndex = 0;
    }

    const tableRows: TableRow[] = [];

    if (headerCells.length > 0) {
      tableRows.push(
        new TableRow({
          tableHeader: true,
          children: headerCells.map(
            (cell) =>
              new TableCell({
                children: [
                  new Paragraph({
                    text: cell,
                    heading: HeadingLevel.HEADING_3,
                  }),
                ],
                shading: {
                  fill: "E2EFDA", // light green-ish header background
                },
                margins: {
                  top: 100,
                  bottom: 100,
                  left: 100,
                  right: 100,
                },
              })
          ),
        })
      );
    }

    for (let r = dataStartIndex; r < rows.length; r++) {
      tableRows.push(
        new TableRow({
          children: rows[r].map(
            (cell) =>
              new TableCell({
                children: [
                  new Paragraph({
                    text: cell,
                  }),
                ],
                margins: {
                  top: 80,
                  bottom: 80,
                  left: 80,
                  right: 80,
                },
              })
          ),
        })
      );
    }

    const table = new Table({
      rows: tableRows,
      width: {
        size: 100,
        type: WidthType.PERCENTAGE,
      },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
        left: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
        right: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
        insideHorizontal: {
          style: BorderStyle.SINGLE,
          size: 2,
          color: "DDDDDD",
        },
        insideVertical: {
          style: BorderStyle.SINGLE,
          size: 2,
          color: "DDDDDD",
        },
      },
    });

    return { table, nextIndex: i };
  }

  const bodyChildren: (Paragraph | Table)[] = [];

  // 3) Convert markdown-like lines into Paragraphs + Tables
  let i = 0;
  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    // Blank line -> a little vertical spacing
    if (!line) {
      bodyChildren.push(
        new Paragraph({
          text: "",
        })
      );
      i++;
      continue;
    }

    // Table block
    if (isTableLine(line)) {
      const { table, nextIndex } = parseTableBlock(i);
      bodyChildren.push(table);
      // Small spacing paragraph after table
      bodyChildren.push(
        new Paragraph({
          text: "",
        })
      );
      i = nextIndex;
      continue;
    }

    // Headings
    if (line.startsWith("# ")) {
      const text = line.replace(/^#\s+/, "");
      bodyChildren.push(
        new Paragraph({
          text,
          heading: HeadingLevel.HEADING_1,
        })
      );
      i++;
      continue;
    }

    if (line.startsWith("## ")) {
      const text = line.replace(/^##\s+/, "");
      bodyChildren.push(
        new Paragraph({
          text,
          heading: HeadingLevel.HEADING_2,
        })
      );
      i++;
      continue;
    }

    if (line.startsWith("### ")) {
      const text = line.replace(/^###\s+/, "");
      bodyChildren.push(
        new Paragraph({
          text,
          heading: HeadingLevel.HEADING_3,
        })
      );
      i++;
      continue;
    }

    // Bullets
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const text = line.replace(/^[-*]\s+/, "");
      bodyChildren.push(
        new Paragraph({
          text: `• ${text}`,
        })
      );
      i++;
      continue;
    }

    // Numbered list (keep it simple for now)
    const numberedMatch = line.match(/^(\d+)\.\s+(.*)$/);
    if (numberedMatch) {
      const [, num, content] = numberedMatch;
      bodyChildren.push(
        new Paragraph({
          text: `${num}. ${content}`,
        })
      );
      i++;
      continue;
    }

    // Default paragraph
    bodyChildren.push(
      new Paragraph({
        text: line,
      })
    );
    i++;
  }

  // 4) Build cover page (Option C style) + body, with Calibri as global font

  const safeTitle = title && title.trim().length > 0 ? title.trim() : "Business Plan";

  const coverChildren: Paragraph[] = [
    new Paragraph({
      text: safeTitle,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    }),
    new Paragraph({
      text: "Business Plan prepared with LineScout",
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      text: new Date().toLocaleDateString(),
      alignment: AlignmentType.CENTER,
      spacing: { after: 800 },
    }),
  ];

  // Page break before body section
  const pageBreakPara = new Paragraph({
    children: [new TextRun({ text: "", break: 1 })],
    pageBreakBefore: true,
  });

// Footer with "Page X of Y"
const footer = new Footer({
  children: [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          font: "Calibri",
          size: 18, // 9pt (docx size is half-points)
          children: [
            "Page ",
            PageNumber.CURRENT,
            " of ",
            PageNumber.TOTAL_PAGES,
          ],
        }),
      ],
    }),
  ],
});

const doc = new Document({
  styles: {
    default: {
      document: {
        run: {
          font: "Calibri",
          size: 24, // 12pt
        },
        paragraph: {
          spacing: {
            line: 276, // ~1.15 line spacing
          },
        },
      },
    },
  },
  sections: [
    {
      properties: {},
      footers: {
        default: footer,
      },
      children: [...coverChildren, pageBreakPara, ...bodyChildren],
    },
  ],
});

  const buffer = await Packer.toBuffer(doc);
  return buffer;
}

// --- PDF builder ------------------------------------------------------------

async function buildPdf(planText: string, title: string) {
  // Remove markdown bold/italic markers
  const cleanedText = stripMarkdownEmphasis(planText);

  // Parse markdown into structured lines
  const parsed = parseMarkdownLines(cleanedText);

  // Create PDF
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595.28, 841.89]); // A4 page
  const margin = 50;
  let y = 841.89 - margin;

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const lineHeight = 14;
  const maxWidth = 595.28 - margin * 2;

  function addPage() {
    page = pdfDoc.addPage([595.28, 841.89]);
    y = 841.89 - margin;
    return page;
  }

  function writeWrapped(
    rawText: string,
    options: { size: number; bold?: boolean; color?: [number, number, number] }
  ) {
    // Sanitize the text for PDF encoding
    const safeText = sanitizeForPdf(rawText);

    const usedFont = options.bold ? boldFont : font;
    const size = options.size;
    const color = options.color || [1, 1, 1];

    const words = safeText.split(/\s+/);
    let line = "";

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const width = usedFont.widthOfTextAtSize(testLine, size);

      if (width > maxWidth && line) {
        if (y < margin + lineHeight) addPage();

        page.drawText(line, {
          x: margin,
          y,
          size,
          font: usedFont,
          color: rgb(...color),
        });
        y -= lineHeight;
        line = word;
      } else {
        line = testLine;
      }
    }

    if (line) {
      if (y < margin + lineHeight) addPage();

      page.drawText(line, {
        x: margin,
        y,
        size,
        font: usedFont,
        color: rgb(...color),
      });
      y -= lineHeight;
    }
  }

  // --- COVER PAGE ---
  writeWrapped(title || "Business Plan", {
    size: 20,
    bold: true,
    color: [0.8, 1, 0.8],
  });

  y -= 10;

  writeWrapped("Prepared with LineScout Business Plan Writer", {
    size: 10,
    color: [0.8, 0.8, 0.8],
  });

  y -= 20;

  // --- MAIN BODY ---
  for (const item of parsed) {
    if (item.type === "blank") {
      y -= lineHeight;
      continue;
    }

    if (item.type === "h1") {
      y -= 8;
      writeWrapped(item.content, { size: 16, bold: true });
      y -= 6;
      continue;
    }

    if (item.type === "h2") {
      y -= 6;
      writeWrapped(item.content, { size: 14, bold: true });
      y -= 4;
      continue;
    }

    if (item.type === "h3") {
      y -= 4;
      writeWrapped(item.content, { size: 12, bold: true });
      continue;
    }

    if (item.type === "bullet") {
      writeWrapped(`• ${item.content}`, { size: 11 });
      continue;
    }

    if (item.type === "numbered") {
      writeWrapped(item.content, { size: 11 });
      continue;
    }

    // Paragraph
    writeWrapped(item.content, { size: 11 });
    y -= 4;
  }

  return await pdfDoc.save();
}

// --- Route handler ----------------------------------------------------------

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const planText: string = body.planText;
    const format: "pdf" | "docx" = body.format;
    const fileName: string | undefined = body.fileName;

    if (!planText || typeof planText !== "string") {
      return NextResponse.json(
        { error: "Missing planText" },
        { status: 400 }
      );
    }

    if (format !== "pdf" && format !== "docx") {
      return NextResponse.json(
        { error: "Invalid format. Use 'pdf' or 'docx'." },
        { status: 400 }
      );
    }

    const safeName = makeSafeFileName(fileName);
    const titleLine = planText.split(/\r?\n/)[0].replace(/^#\s*/, "").trim();

   if (format === "docx") {
  // Clean markdown noise (**bold**, _italic_, etc.) before building the DOCX
  const cleanedText = stripMarkdownEmphasis(planText);

  const docBytes = await buildDocx(cleanedText, titleLine || safeName);

  // Tell TypeScript explicitly that these bytes are a valid body
  return new NextResponse(docBytes as any, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeName}.docx"`,
    },
  });
}

    const pdfBytes = await buildPdf(planText, titleLine || safeName);
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Export API error:", error);
    return NextResponse.json(
      { error: "Failed to export document" },
      { status: 500 }
    );
  }
}