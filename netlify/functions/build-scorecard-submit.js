const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { sendEmail } = require("./_lib/email");
const {
  ensureBuildScorecardTablesTochukwu,
  saveBuildScorecardLead,
} = require("./_lib/build-scorecards-tochukwu");

const SUPPORT_EMAIL = "support@tochukwunkwocha.com";

const QUESTIONS = [
  { text: "Do you have a clear workflow problem to fix now?", options: [{ label: "Yes, urgent", score: 10 }, { label: "Somewhat", score: 7 }, { label: "Not clear", score: 2 }] },
  { text: "How soon do you want to start?", options: [{ label: "Immediately", score: 10 }, { label: "Within 30 days", score: 8 }, { label: "Later", score: 3 }] },
  { text: "Decision ownership", options: [{ label: "I decide", score: 10 }, { label: "Small group", score: 7 }, { label: "Unclear", score: 2 }] },
  { text: "Current process maturity", options: [{ label: "Documented", score: 10 }, { label: "Partially documented", score: 6 }, { label: "Mostly ad hoc", score: 3 }] },
  { text: "Team readiness", options: [{ label: "Ready to adopt", score: 10 }, { label: "Needs support", score: 6 }, { label: "Not ready", score: 2 }] },
  { text: "Data availability", options: [{ label: "Data exists and accessible", score: 10 }, { label: "Some data gaps", score: 6 }, { label: "Major gaps", score: 2 }] },
  { text: "Scope clarity", options: [{ label: "Single clear use-case", score: 10 }, { label: "Few use-cases", score: 7 }, { label: "Broad/unclear", score: 2 }] },
  { text: "Budget intent", options: [{ label: "Budget approved", score: 10 }, { label: "Budget likely", score: 7 }, { label: "No budget yet", score: 1 }] },
  { text: "Operational pain", options: [{ label: "High", score: 10 }, { label: "Medium", score: 7 }, { label: "Low", score: 3 }] },
  { text: "Success urgency", options: [{ label: "Need result in 30 days", score: 10 }, { label: "Flexible", score: 6 }, { label: "No urgency", score: 1 }] },
];

function clean(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max || 400);
}

function normalizeEmail(value) {
  const email = clean(value, 220).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function computeScore(answersInput) {
  if (!Array.isArray(answersInput) || answersInput.length !== QUESTIONS.length) return { ok: false, error: "Invalid answers payload" };
  let total = 0;
  const normalizedAnswers = [];
  for (let i = 0; i < QUESTIONS.length; i += 1) {
    const answer = answersInput[i] || {};
    const index = Number(answer.answerIndex);
    if (!Number.isInteger(index) || index < 0 || index >= QUESTIONS[i].options.length) return { ok: false, error: "Every question must have a valid answer" };
    const option = QUESTIONS[i].options[index];
    total += option.score;
    normalizedAnswers.push({ question: QUESTIONS[i].text, answer: option.label, score: option.score });
  }
  return { ok: true, total, normalizedAnswers };
}

function bandFor(score) {
  if (score >= 70) return { key: "qualified", headline: "You are qualified for a paid discovery call.", nextStep: "Book Paid Discovery Call", followUpRequired: false };
  if (score >= 50) return { key: "manual_review", headline: "Thank you. Your application is under manual review.", nextStep: "Manual review", followUpRequired: true };
  return { key: "not_fit", headline: "Thank you for applying. This may not be the right fit right now.", nextStep: "Not fit", followUpRequired: false };
}

function computeBuildFormScore(body) {
  var score = 0;
  var isHardDQ = false;
  var answers = [];
  var problemText = clean(body.problemDesc, 4000);
  var problemWords = problemText ? problemText.split(/\s+/).filter(Boolean).length : 0;
  var problemPoints = 0;
  if (problemWords >= 15) problemPoints = 25;
  else if (problemWords >= 5) problemPoints = 10;
  score += problemPoints;
  answers.push({ question: "Problem clarity", answer: `${problemWords} words`, score: problemPoints });

  var process = clean(body.currentProcess, 40);
  var processPoints = 0;
  if (process === "chaos" || process === "paper" || process === "combo") processPoints = 15;
  else if (process === "existing") processPoints = 10;
  score += processPoints;
  answers.push({ question: "Current process", answer: process || "-", score: processPoints });

  var complexity = clean(body.complexity, 40);
  var complexityPoints = 0;
  if (complexity.indexOf("dq_") === 0) isHardDQ = true;
  else if (complexity === "simple") complexityPoints = 20;
  else if (complexity === "medium") complexityPoints = 10;
  score += complexityPoints;
  answers.push({ question: "Project complexity", answer: complexity || "-", score: complexityPoints });

  var budget = Number(body.budget);
  if (Number.isFinite(budget)) {
    if (budget === 0) isHardDQ = true;
    score += Math.max(0, Math.round(budget));
  }
  answers.push({ question: "Budget", answer: String(body.budget || "-"), score: Number.isFinite(budget) ? Math.max(0, Math.round(budget)) : 0 });

  var decision = Number(body.decision);
  if (Number.isFinite(decision)) score += Math.max(0, Math.round(decision));
  answers.push({ question: "Decision authority", answer: String(body.decision || "-"), score: Number.isFinite(decision) ? Math.max(0, Math.round(decision)) : 0 });

  var timeline = clean(body.timeline, 40);
  var timelinePoints = 0;
  if (timeline.indexOf("dq_") === 0) {
    isHardDQ = true;
  } else {
    var timelineNum = Number(timeline);
    timelinePoints = Number.isFinite(timelineNum) ? Math.max(0, Math.round(timelineNum)) : 0;
    score += timelinePoints;
  }
  answers.push({ question: "Timeline", answer: timeline || "-", score: timelinePoints });

  return { score, isHardDQ, normalizedAnswers: answers };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") return badMethod();
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch (_error) { return json(400, { ok: false, error: "Invalid JSON body" }); }

  const fullName = clean(body.fullName || body.name, 140);
  const businessName = clean(body.businessName || body.companyName, 180);
  const workEmail = normalizeEmail(body.workEmail || body.email);
  const phone = clean(body.phone, 80);
  const role = clean(body.role || "Build Applicant", 120);
  const companySize = clean(body.companySize || body.website || "", 80);

  if (!fullName || !businessName || !workEmail || !phone || !role) {
    return json(400, { ok: false, error: "All required fields are required." });
  }

  let score = 0;
  let normalizedAnswers = [];
  let hardDq = false;
  if (Array.isArray(body.answers) && body.answers.length === QUESTIONS.length) {
    const answersResult = computeScore(body.answers);
    if (!answersResult.ok) return json(400, { ok: false, error: answersResult.error });
    score = Number(answersResult.total || 0);
    normalizedAnswers = answersResult.normalizedAnswers;
  } else {
    const alt = computeBuildFormScore(body);
    score = Number(alt.score || 0);
    normalizedAnswers = alt.normalizedAnswers;
    hardDq = alt.isHardDQ;
  }
  if (hardDq && score > 49) score = 49;
  const band = bandFor(score);

  const leadUuid = `build_scorecard_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;

  try {
    const pool = getPool();
    await ensureBuildScorecardTablesTochukwu(pool);
    await saveBuildScorecardLead(pool, {
      leadUuid,
      fullName,
      businessName,
      workEmail,
      phone,
      role,
      companySize,
      score,
      bandKey: band.key,
      headline: band.headline,
      nextStep: band.nextStep,
      answers: normalizedAnswers,
      sourcePath: "/build-scorecard/",
      followUpRequired: band.followUpRequired,
    });

    const answersText = normalizedAnswers
      .map(function (entry, index) { return `Q${index + 1}: ${entry.question}\nAnswer: ${entry.answer} (${entry.score})`; })
      .join("\n\n");
    await sendEmail({
      to: SUPPORT_EMAIL,
      subject: `Build Scorecard Submission — ${businessName} (${score}/100, ${band.key})`,
      text: [
        "New Build scorecard submission",
        `Name: ${fullName}`,
        `Business: ${businessName}`,
        `Email: ${workEmail}`,
        `Phone: ${phone}`,
        `Role: ${role}`,
        `Company size: ${companySize || "-"}`,
        `Score: ${score}/100`,
        `Band: ${band.key}`,
        `Follow-up required: ${band.followUpRequired ? "yes" : "no"}`,
        "",
        answersText,
      ].join("\n"),
    }).catch(function () { return null; });

    return json(200, {
      ok: true,
      score,
      bandKey: band.key,
      headline: band.headline,
      qualified: band.key === "qualified",
      leadUuid,
      paymentRequired: band.key === "qualified",
    });
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Could not submit scorecard" });
  }
};
