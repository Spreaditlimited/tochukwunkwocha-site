import { NextRequest, NextResponse } from "next/server";
import mysql from "mysql2/promise";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getDraftFromDb(sessionId: string) {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;

  if (!host || !user || !password || !database) {
    throw new Error("DB env vars missing.");
  }

  const pool = mysql.createPool({
    host,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });

  try {
    const [rows] = await pool.execute<any[]>(
      `
      SELECT intake_json
      FROM linescout_business_plan_drafts
      WHERE session_id = ?
      LIMIT 1
      `,
      [sessionId]
    );

    if (!rows || rows.length === 0) return null;

    const intakeJson = rows[0]?.intake_json;
    if (!intakeJson) return null;

    // mysql2 may return JSON as object or string depending on config
    const parsed = typeof intakeJson === "string" ? JSON.parse(intakeJson) : intakeJson;
    return parsed;
  } finally {
    await pool.end();
  }
}

export async function POST(req: NextRequest) {
  try {
    const baseUrl = process.env.N8N_BASE_URL || process.env.NEXT_PUBLIC_N8N_BASE_URL;

    if (!baseUrl) {
      return NextResponse.json(
        { ok: false, error: "N8N_BASE_URL is not configured." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const sessionId = String(body?.sessionId || "").trim();

    if (!sessionId) {
      return NextResponse.json(
        { ok: false, error: "sessionId is required." },
        { status: 400 }
      );
    }

    // Load chat messages from DB draft
    const draft = await getDraftFromDb(sessionId);

    const messages = draft?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "No chat messages found for this sessionId. Please chat first, then try Prefill again.",
        },
        { status: 400 }
      );
    }

    // Ask n8n to extract intake from the chat
    const n8nRes = await fetch(`${baseUrl}/webhook/linescout_business_plan_intake_extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, messages }),
    });

    const n8nData = await n8nRes.json().catch(() => null);

    if (!n8nRes.ok || !n8nData?.ok || !n8nData?.intake) {
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to extract intake from chat.",
          details: n8nData,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, intake: n8nData.intake }, { status: 200 });
  } catch (err: any) {
    console.error("Business plan prefill error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Unexpected server error." },
      { status: 500 }
    );
  }
}