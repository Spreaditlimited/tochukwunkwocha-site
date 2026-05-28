const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { requireStudentSession } = require("./_lib/user-auth");
const { hasCourseAccess } = require("./_lib/learning-progress");
const { sendEmail } = require("./_lib/email");
const {
  ensureLearningSupportTables,
  getCourseLearningFeatures,
  createCommunityReply,
  normalizeCourseSlug,
  COMMUNITY_REPLIES_TABLE,
  COMMUNITY_THREADS_TABLE,
} = require("./_lib/learning-support");

function parseBody(event) {
  try {
    return event && event.body ? JSON.parse(event.body) : {};
  } catch (_error) {
    return null;
  }
}

function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function siteBaseUrl() {
  return clean(process.env.SITE_BASE_URL || "https://tochukwunkwocha.com", 240).replace(/\/$/, "");
}

async function notifyParentReplyAuthor(pool, input) {
  const courseSlug = normalizeCourseSlug(input && input.courseSlug);
  const parentReplyId = Number(input && input.parentReplyId || 0);
  const actorAccountId = Number(input && input.actorAccountId || 0);
  const actorEmail = clean(input && input.actorEmail, 220).toLowerCase();
  const actorName = clean(input && input.actorName, 180) || "A student";
  const replyBody = clean(input && input.replyBody, 20000);

  if (!courseSlug || !(parentReplyId > 0)) return { attempted: false, sent: false, reason: "not_nested_reply" };

  const [rows] = await pool.query(
    `SELECT r.id, r.account_id, r.author_email, r.author_name, r.body,
            t.id AS thread_id, t.title
     FROM ${COMMUNITY_REPLIES_TABLE} r
     JOIN ${COMMUNITY_THREADS_TABLE} t ON t.id = r.thread_id
     WHERE r.id = ?
       AND r.course_slug = ?
     LIMIT 1`,
    [parentReplyId, courseSlug]
  );
  const parent = rows && rows[0] ? rows[0] : null;
  if (!parent) return { attempted: false, sent: false, reason: "parent_not_found" };

  const recipientEmail = clean(parent.author_email, 220).toLowerCase();
  if (!recipientEmail) return { attempted: false, sent: false, reason: "recipient_missing" };

  const recipientAccountId = Number(parent.account_id || 0);
  if ((recipientAccountId > 0 && actorAccountId > 0 && recipientAccountId === actorAccountId) || (recipientEmail && recipientEmail === actorEmail)) {
    return { attempted: false, sent: false, reason: "self_reply" };
  }

  const recipientName = clean(parent.author_name, 180) || recipientEmail;
  const threadTitle = clean(parent.title, 220) || "Course Community";
  const parentBody = clean(parent.body, 20000);
  const threadUrl = `${siteBaseUrl()}/dashboard/courses/player/?course=${encodeURIComponent(courseSlug)}`;

  const subject = `${actorName} replied to your message in ${threadTitle}`;
  const html = [
    `<p>Hello ${escapeHtml(recipientName)},</p>`,
    `<p><strong>${escapeHtml(actorName)}</strong> replied to your message in the course community.</p>`,
    `<p><strong>Thread:</strong> ${escapeHtml(threadTitle)}</p>`,
    parentBody ? `<p><strong>Your message:</strong><br/>${escapeHtml(parentBody)}</p>` : "",
    replyBody ? `<p><strong>Reply:</strong><br/>${escapeHtml(replyBody)}</p>` : "",
    `<p><a href="${threadUrl}">Open discussion board</a></p>`,
    "<p>Tochukwu Tech and AI Academy</p>",
  ].filter(Boolean).join("\n");
  const text = [
    `Hello ${recipientName},`,
    "",
    `${actorName} replied to your message in the course community.`,
    `Thread: ${threadTitle}`,
    parentBody ? `Your message: ${parentBody}` : "",
    replyBody ? `Reply: ${replyBody}` : "",
    `Open discussion board: ${threadUrl}`,
    "",
    "Tochukwu Tech and AI Academy",
  ].filter(Boolean).join("\n");

  await sendEmail({ to: recipientEmail, subject, html, text });
  return { attempted: true, sent: true, to: recipientEmail };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  const body = parseBody(event);
  if (!body) return json(400, { ok: false, error: "Invalid JSON payload" });

  const courseSlug = normalizeCourseSlug(body.course_slug);
  const threadId = Number(body.thread_id || 0);
  const parentReplyId = Number(body.parent_reply_id || 0);
  const mentionAccountId = Number(body.mention_account_id || 0);
  const mentionEmail = clean(body.mention_email, 220).toLowerCase();
  const mentionName = clean(body.mention_name, 180);
  const text = clean(body.body, 20000);
  if (!courseSlug) return json(400, { ok: false, error: "course_slug is required" });
  if (!(threadId > 0)) return json(400, { ok: false, error: "thread_id is required" });

  const pool = getPool();
  try {
    const session = await requireStudentSession(pool, event);
    if (!session.ok) return json(session.statusCode || 401, { ok: false, error: session.error || "Unauthorized" });

    await ensureLearningSupportTables(pool, { bootstrap: true });
    const access = await hasCourseAccess(pool, session.account.email, courseSlug, session.account.id);
    if (!access) return json(403, { ok: false, error: "You do not currently have access to this course." });

    const features = await getCourseLearningFeatures(pool, courseSlug);
    if (!features.course_community_enabled) {
      return json(403, { ok: false, error: "Course community is currently disabled for this course." });
    }

    const item = await createCommunityReply(pool, {
      course_slug: courseSlug,
      thread_id: threadId,
      account_id: session.account.id,
      author_email: session.account.email,
      author_name: session.account.fullName,
      parent_reply_id: parentReplyId > 0 ? parentReplyId : null,
      mention_account_id: mentionAccountId > 0 ? mentionAccountId : null,
      mention_email: mentionEmail || null,
      mention_name: mentionName || null,
      body: text,
    });

    let notification = { attempted: false, sent: false };
    try {
      notification = await notifyParentReplyAuthor(pool, {
        courseSlug,
        parentReplyId,
        actorAccountId: session.account.id,
        actorEmail: session.account.email,
        actorName: session.account.fullName,
        replyBody: text,
      });
    } catch (emailError) {
      notification = {
        attempted: true,
        sent: false,
        error: emailError && emailError.message ? emailError.message : "email_send_failed",
      };
      console.warn("community_reply_notification_failed", {
        course_slug: courseSlug,
        thread_id: threadId,
        parent_reply_id: parentReplyId,
        error: notification.error,
      });
    }

    return json(200, { ok: true, item, notification });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not post reply." });
  }
};
