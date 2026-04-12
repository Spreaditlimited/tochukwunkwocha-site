const { json, badMethod } = require("./_lib/http");
const { sendEmail } = require("./_lib/email");
const { syncBrevoSubscriber } = require("./_lib/brevo");

const BREVO_SCHOOL_READINESS_LIST_ID = 6;

const QUESTIONS = [
  {
    text: "Which best describes your school?",
    options: [
      { label: "Private secondary school with active interest in innovation", score: 10 },
      { label: "Private secondary school with moderate interest in new programs", score: 8 },
      { label: "Education group or school network managing multiple campuses", score: 10 },
      { label: "Public secondary school", score: 4 },
      { label: "We are still exploring and not yet sure", score: 1 },
    ],
  },
  {
    text: "Who would most likely lead this program inside your school?",
    options: [
      { label: "Principal, proprietor, or top leadership", score: 10 },
      { label: "ICT coordinator or digital learning lead", score: 9 },
      { label: "Vice principal or academic director", score: 8 },
      { label: "A teacher without formal program ownership", score: 4 },
      { label: "No one has been assigned yet", score: 0 },
    ],
  },
  {
    text: "How soon would your school realistically want to start a program like this?",
    options: [
      { label: "Within 2 weeks", score: 10 },
      { label: "Within 30 days", score: 8 },
      { label: "This term", score: 6 },
      { label: "Later this academic year", score: 3 },
      { label: "Just exploring for now", score: 0 },
    ],
  },
  {
    text: "How many students could your school realistically start with in the first cohort?",
    options: [
      { label: "Fewer than 20 students", score: 4 },
      { label: "20 to 50 students", score: 7 },
      { label: "51 to 100 students", score: 10 },
      { label: "101 to 300 students", score: 10 },
      { label: "Not sure yet", score: 1 },
    ],
  },
  {
    text: "Do your students have access to laptops for practical sessions?",
    options: [
      { label: "Yes, most students already have reliable access", score: 10 },
      { label: "Yes, through a school lab or shared access setup", score: 8 },
      { label: "Access is possible, but inconsistent", score: 4 },
      { label: "Very limited access right now", score: 1 },
      { label: "No meaningful laptop access", score: 0 },
    ],
  },
  {
    text: "How comfortable is your school with introducing AI learning in a guided, supervised format?",
    options: [
      { label: "Very comfortable, we want to move fast", score: 10 },
      { label: "Comfortable, with proper structure and guidance", score: 8 },
      { label: "Open, but we need reassurance", score: 5 },
      { label: "Not fully convinced yet", score: 2 },
      { label: "We are hesitant about AI in schools", score: 0 },
    ],
  },
  {
    text: "Which outcome matters most to your school right now?",
    options: [
      { label: "Helping students build real digital projects", score: 10 },
      { label: "Strengthening ICT and practical digital exposure", score: 9 },
      { label: "Positioning the school as innovative and forward-looking", score: 8 },
      { label: "Offering an extra club or holiday activity", score: 5 },
      { label: "We are not yet clear on the outcome we want", score: 1 },
    ],
  },
  {
    text: "How easy would it be for your school to onboard students into a simple digital dashboard?",
    options: [
      { label: "Very easy, we can manage student onboarding quickly", score: 10 },
      { label: "Reasonably easy with a little guidance", score: 8 },
      { label: "Possible, but admin support may be slow", score: 4 },
      { label: "Difficult with our current process", score: 1 },
      { label: "We do not have anyone to manage onboarding", score: 0 },
    ],
  },
  {
    text: "Which statement best describes how decisions like this get approved in your school?",
    options: [
      { label: "We can make a decision internally once the offer makes sense", score: 10 },
      { label: "We need one short internal review before deciding", score: 8 },
      { label: "We need approval from several people", score: 5 },
      { label: "We would need broad parent-level consensus first", score: 2 },
      { label: "There is no clear process yet", score: 0 },
    ],
  },
];

const RESULT_BANDS = {
  ready: {
    min: 72,
    max: 90,
    headline: "Your School Is Ready to Launch",
    explanation:
      "Your answers show strong readiness for Prompt to Profit for Schools. Your school likely has the internal ownership, student access, and implementation structure needed to onboard a first cohort successfully.",
    ctaText: "Book Your School Onboarding Call",
    ctaHref: "https://tochukwunkwocha.com/schools/book-call/",
  },
  close: {
    min: 54,
    max: 71,
    headline: "Your School Is Close. You Need a Clear Rollout Plan",
    explanation:
      "Your school shows good potential for successful implementation, but one or two practical issues may slow things down. In most cases, these are easy to fix with the right rollout plan.",
    ctaText: "Book a Readiness Call",
    ctaHref: "https://tochukwunkwocha.com/schools/book-call/",
  },
  pilot: {
    min: 36,
    max: 53,
    headline: "Your School Can Start, But Begin With a Pilot",
    explanation:
      "Your school is not yet ideal for a full rollout, but that does not mean you should wait. A smaller pilot cohort is likely the best next step and can help you test implementation without stress.",
    ctaText: "Book a Pilot Planning Call",
    ctaHref: "https://tochukwunkwocha.com/schools/book-call/",
  },
  notReady: {
    min: 0,
    max: 35,
    headline: "Your School Needs a Simple Readiness Plan First",
    explanation:
      "Your school may not be ready to launch immediately, but the gaps are practical and fixable. The main issues are usually ownership, device access, or internal decision structure.",
    ctaText: "Talk to Us About Readiness",
    ctaHref: "https://tochukwunkwocha.com/schools/book-call/",
  },
};

function clean(value, maxLen) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function computeScoreFromAnswers(answersInput) {
  if (!Array.isArray(answersInput) || answersInput.length !== QUESTIONS.length) {
    return { ok: false, error: "Invalid answers payload" };
  }

  let total = 0;
  const normalizedAnswers = [];

  for (let i = 0; i < QUESTIONS.length; i += 1) {
    const answer = answersInput[i] || {};
    const index = Number(answer.answerIndex);

    if (!Number.isInteger(index) || index < 0 || index >= QUESTIONS[i].options.length) {
      return { ok: false, error: "Every question must have a valid answer" };
    }

    const option = QUESTIONS[i].options[index];
    total += option.score;

    normalizedAnswers.push({
      question: QUESTIONS[i].text,
      answer: option.label,
      score: option.score,
    });
  }

  return { ok: true, total, normalizedAnswers };
}

function resolveBand(score) {
  if (score >= RESULT_BANDS.ready.min) return "ready";
  if (score >= RESULT_BANDS.close.min) return "close";
  if (score >= RESULT_BANDS.pilot.min) return "pilot";
  return "notReady";
}

function firstName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts.length ? parts[0] : "there";
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (_error) {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  if (clean(body.website, 120)) {
    return json(200, { ok: true });
  }

  const fullName = clean(body.fullName, 140);
  const schoolName = clean(body.schoolName, 180);
  const workEmail = clean(body.workEmail, 190).toLowerCase();
  const phone = clean(body.phone, 80);
  const role = clean(body.role, 120);
  const studentPopulation = clean(body.studentPopulation, 60);

  if (!fullName || !schoolName || !workEmail || !phone || !role || !studentPopulation) {
    return json(400, { ok: false, error: "All lead form fields are required." });
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(workEmail);
  if (!emailOk) {
    return json(400, { ok: false, error: "Please enter a valid work email address." });
  }

  const scoreResult = computeScoreFromAnswers(body.answers);
  if (!scoreResult.ok) {
    return json(400, { ok: false, error: scoreResult.error || "Could not validate scorecard answers." });
  }

  const score = Number(scoreResult.total || 0);
  const bandKey = resolveBand(score);
  const band = RESULT_BANDS[bandKey];

  const safeFullName = escapeHtml(fullName);
  const safeSchoolName = escapeHtml(schoolName);
  const safeWorkEmail = escapeHtml(workEmail);
  const safePhone = escapeHtml(phone);
  const safeRole = escapeHtml(role);
  const safePopulation = escapeHtml(studentPopulation);

  const answersHtml = scoreResult.normalizedAnswers
    .map(function (entry, index) {
      return `<li><strong>Q${index + 1}:</strong> ${escapeHtml(entry.question)}<br/><strong>Answer:</strong> ${escapeHtml(entry.answer)} <em>(${entry.score}/10)</em></li>`;
    })
    .join("");

  const answersText = scoreResult.normalizedAnswers
    .map(function (entry, index) {
      return [
        `Q${index + 1}: ${entry.question}`,
        `Answer: ${entry.answer} (${entry.score}/10)`,
      ].join("\n");
    })
    .join("\n\n");

  const internalSubject = `School AI Readiness Lead — ${schoolName} (${score}/90)`;
  const internalHtml = [
    "<h2>New School AI Readiness Lead</h2>",
    `<p><strong>Full Name:</strong> ${safeFullName}</p>`,
    `<p><strong>School Name:</strong> ${safeSchoolName}</p>`,
    `<p><strong>Work Email:</strong> ${safeWorkEmail}</p>`,
    `<p><strong>Phone Number:</strong> ${safePhone}</p>`,
    `<p><strong>Role:</strong> ${safeRole}</p>`,
    `<p><strong>Estimated Student Population:</strong> ${safePopulation}</p>`,
    `<p><strong>Score:</strong> ${score}/90</p>`,
    `<p><strong>Result:</strong> ${escapeHtml(band.headline)}</p>`,
    "<h3>Question Responses</h3>",
    `<ol>${answersHtml}</ol>`,
  ].join("");

  const internalText = [
    "New School AI Readiness Lead",
    `Full Name: ${fullName}`,
    `School Name: ${schoolName}`,
    `Work Email: ${workEmail}`,
    `Phone Number: ${phone}`,
    `Role: ${role}`,
    `Estimated Student Population: ${studentPopulation}`,
    `Score: ${score}/90`,
    `Result: ${band.headline}`,
    "",
    "Question Responses",
    answersText,
  ].join("\n");

  const greetingName = escapeHtml(firstName(fullName));
  const userSubject = "Your School AI Readiness Result";
  const userHtml = [
    `<p>Hello ${greetingName},</p>`,
    "<p>Thank you for taking the School AI Readiness Scorecard.</p>",
    `<p><strong>Your score:</strong> ${score}/90</p>`,
    `<p><strong>${escapeHtml(band.headline)}</strong></p>`,
    `<p>${escapeHtml(band.explanation)}</p>`,
    "<p>Prompt to Profit for Schools helps secondary school students learn practical AI use by building real websites step by step through a structured, beginner-friendly system.</p>",
    `<p><strong>Recommended next step:</strong> ${escapeHtml(band.ctaText)}</p>`,
    `<p><a href="${band.ctaHref}">Book Your Call</a></p>`,
    "<p>If your school is considering a first cohort, this is the best place to start.</p>",
  ].join("");

  const userText = [
    `Hello ${firstName(fullName)},`,
    "",
    "Thank you for taking the School AI Readiness Scorecard.",
    `Your score: ${score}/90`,
    band.headline,
    band.explanation,
    "",
    "Prompt to Profit for Schools helps secondary school students learn practical AI use by building real websites step by step through a structured, beginner-friendly system.",
    "",
    `Recommended next step: ${band.ctaText}`,
    `Book your call: ${band.ctaHref}`,
  ].join("\n");

  try {
    await sendEmail({
      to: "support@tochukwunkwocha.com",
      subject: internalSubject,
      html: internalHtml,
      text: internalText,
    });

    try {
      await sendEmail({
        to: workEmail,
        subject: userSubject,
        html: userHtml,
        text: userText,
      });
    } catch (_ackError) {}

    // Best effort Brevo sync: first email is handled in code above, followups run via Brevo automations.
    let brevoSynced = false;
    let brevoError = "";
    try {
      const synced = await syncBrevoSubscriber({
        fullName,
        email: workEmail,
        listId: BREVO_SCHOOL_READINESS_LIST_ID,
      });
      brevoSynced = Boolean(synced && synced.ok);
      brevoError = brevoSynced ? "" : String((synced && synced.error) || "").trim();
    } catch (error) {
      brevoSynced = false;
      brevoError = error && error.message ? String(error.message) : "brevo_sync_failed";
    }

    return json(200, {
      ok: true,
      score,
      bandKey,
      headline: band.headline,
      nextStep: band.ctaText,
      brevo: {
        synced: brevoSynced,
        listId: BREVO_SCHOOL_READINESS_LIST_ID,
        error: brevoError || null,
      },
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: error && error.message ? error.message : "Could not submit scorecard lead.",
    });
  }
};
