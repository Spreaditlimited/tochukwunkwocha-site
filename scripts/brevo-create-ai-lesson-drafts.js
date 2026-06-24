#!/usr/bin/env node

const { lessons, defaultListId, seriesName } = require("../content/email-series/practical-ai-building-lessons");

const API_BASE = "https://api.brevo.com/v3";

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => String(item || "").startsWith(prefix));
  if (!found) return fallback;
  return found.slice(prefix.length);
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 1000);
}

function boolArg(name) {
  return process.argv.includes(`--${name}`);
}

async function brevoRequest(path, payload) {
  const apiKey = clean(process.env.BREVO_API_KEY || process.env.SENDINBLUE_API_KEY, 500);
  if (!apiKey) throw new Error("Missing BREVO_API_KEY");

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (json && (json.message || json.error)) || `Brevo error ${res.status}`;
    throw new Error(message);
  }
  return json;
}

function campaignPayload(lesson, options) {
  const listId = Number(options.listId || defaultListId);
  if (!Number.isFinite(listId) || listId <= 0) throw new Error("Invalid Brevo list id");

  const senderEmail = clean(options.senderEmail || process.env.BREVO_SENDER_EMAIL, 220);
  const senderName = clean(options.senderName || process.env.BREVO_SENDER_NAME || "Tochukwu Nkwocha", 180);
  if (!senderEmail) throw new Error("Missing BREVO_SENDER_EMAIL or --sender-email");

  return {
    name: `${seriesName} ${String(lesson.number).padStart(2, "0")} - ${lesson.name}`,
    subject: lesson.subject,
    previewText: lesson.previewText,
    sender: {
      name: senderName,
      email: senderEmail,
    },
    type: "classic",
    htmlContent: lesson.htmlContent,
    recipients: {
      listIds: [listId],
    },
  };
}

async function main() {
  const options = {
    listId: arg("list-id", process.env.BREVO_LESSON_LIST_ID || String(defaultListId)),
    senderEmail: arg("sender-email", process.env.BREVO_SENDER_EMAIL || ""),
    senderName: arg("sender-name", process.env.BREVO_SENDER_NAME || "Tochukwu Nkwocha"),
    dryRun: boolArg("dry-run"),
  };

  console.log(`Preparing ${lessons.length} ${seriesName} drafts for Brevo list ${options.listId}.`);

  for (const lesson of lessons) {
    const payload = campaignPayload(lesson, options);
    if (options.dryRun) {
      console.log(`[dry-run] ${payload.name} :: ${payload.subject}`);
      continue;
    }
    const result = await brevoRequest("/emailCampaigns", payload);
    console.log(`created_campaign lesson=${lesson.number} id=${result && result.id ? result.id : "unknown"}`);
  }
}

main().catch((error) => {
  console.error("brevo_create_ai_lessons_failed", error && error.message ? error.message : error);
  process.exit(1);
});
