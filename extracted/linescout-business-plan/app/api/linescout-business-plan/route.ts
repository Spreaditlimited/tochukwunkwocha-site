import { NextRequest, NextResponse } from "next/server";

const N8N_BASE_URL = process.env.N8N_BASE_URL;

if (!N8N_BASE_URL) {
  console.warn(
    "N8N_BASE_URL is not set. Please define it in your .env.local file."
  );
}

export async function POST(req: NextRequest) {
  try {
    if (!N8N_BASE_URL) {
      return NextResponse.json(
        {
          ok: false,
          error: "N8N_BASE_URL is not configured on the server.",
        },
        { status: 500 }
      );
    }

    const body = await req.json();

    // Basic sanity checks – keep this light
    const { token, type, currency, exchangeRate, format, intake } = body;

    if (!token || !type || type !== "business_plan") {
      return NextResponse.json(
        {
          ok: false,
          error: "Valid token and type=business_plan are required.",
        },
        { status: 400 }
      );
    }

    if (!currency || (currency !== "NGN" && currency !== "USD")) {
      return NextResponse.json(
        {
          ok: false,
          error: "Currency must be NGN or USD.",
        },
        { status: 400 }
      );
    }

    if (!exchangeRate || typeof exchangeRate !== "number") {
      return NextResponse.json(
        {
          ok: false,
          error: "A valid numeric exchangeRate is required.",
        },
        { status: 400 }
      );
    }

    if (!intake || typeof intake !== "object") {
      return NextResponse.json(
        {
          ok: false,
          error: "Business plan intake details are required.",
        },
        { status: 400 }
      );
    }

    // Forward this request to n8n
    const n8nResponse = await fetch(
      `${N8N_BASE_URL}/webhook/linescout_business_plan`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // We send the same body structure n8n expects
        body: JSON.stringify({
          token,
          type,
          currency,
          exchangeRate,
          format: format || "both",
          intake,
        }),
      }
    );

    const data = await n8nResponse.json().catch(() => null);

    if (!n8nResponse.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "n8n workflow returned an error.",
          status: n8nResponse.status,
          details: data,
        },
        { status: 502 }
      );
    }

    // At this point n8n has already validated and possibly consumed the token,
    // generated the plan and returned JSON like:
    // { ok, canGenerate, consumed, message, token, planText, ... }
    return NextResponse.json(data, { status: 200 });
  } catch (err: any) {
    console.error("Error in /api/linescout-business-plan:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Unexpected server error.",
      },
      { status: 500 }
    );
  }
}