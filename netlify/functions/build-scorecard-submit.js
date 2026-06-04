const { json, badMethod } = require("./_lib/http");
const { getPool } = require("./_lib/db");
const { sendEmail } = require("./_lib/email");
const {
  ensureBuildScorecardTablesTochukwu,
  saveBuildScorecardLead,
} = require("./_lib/build-scorecards-tochukwu");

const SUPPORT_EMAIL = "support@tochukwunkwocha.com";
const BUILD_FORM_MAX_SCORE_WITHOUT_BUDGET = 80;
const LEGACY_MAX_SCORE_WITHOUT_BUDGET = 90;
const BUDGET_LABELS = {
  "15": "₦1m – ₦3m (Approx. $714 – $2,143)",
  "18": "₦3m – ₦5m (Approx. $2,143 – $3,571)",
  "20": "₦5m+ (Approx. $3,571+)",
  ngn_1m_3m: "₦1m – ₦3m (Approx. $714 – $2,143)",
  ngn_3m_5m: "₦3m – ₦5m (Approx. $2,143 – $3,571)",
  ngn_5m_plus: "₦5m+ (Approx. $3,571+)",
};
const VALID_BUILD_BUDGETS = new Set(Object.keys(BUDGET_LABELS));

const QUESTIONS = [
  { text: "Do you have a clear workflow problem to fix now?", options: [{ label: "Yes, urgent", score: 10 }, { label: "Somewhat", score: 7 }, { label: "Not clear", score: 2 }] },
  { text: "How soon do you want to start?", options: [{ label: "Immediately", score: 10 }, { label: "Within 30 days", score: 8 }, { label: "Later", score: 3 }] },
  { text: "Decision ownership", options: [{ label: "I decide", score: 10 }, { label: "Small group", score: 7 }, { label: "Unclear", score: 2 }] },
  { text: "Current process maturity", options: [{ label: "Documented", score: 10 }, { label: "Partially documented", score: 6 }, { label: "Mostly ad hoc", score: 3 }] },
  { text: "Team readiness", options: [{ label: "Ready to adopt", score: 10 }, { label: "Needs support", score: 6 }, { label: "Not ready", score: 2 }] },
  { text: "Data availability", options: [{ label: "Data exists and accessible", score: 10 }, { label: "Some data gaps", score: 6 }, { label: "Major gaps", score: 2 }] },
  { text: "Scope clarity", options: [{ label: "Single clear use-case", score: 10 }, { label: "Few use-cases", score: 7 }, { label: "Broad/unclear", score: 2 }] },
  { text: "Budget intent", options: [{ label: "Budget approved", score: 0 }, { label: "Budget likely", score: 0 }, { label: "No budget yet", score: 0 }] },
  { text: "Operational pain", options: [{ label: "High", score: 10 }, { label: "Medium", score: 7 }, { label: "Low", score: 3 }] },
  { text: "Success urgency", options: [{ label: "Need result in 30 days", score: 10 }, { label: "Flexible", score: 6 }, { label: "No urgency", score: 1 }] },
];

function clean(value, max) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max || 400);
}

function cleanText(value, max) {
  return String(value || "").trim().slice(0, max || 4000);
}

function normalizeEmail(value) {
  const email = clean(value, 220).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function normalizeScore(score, maxScore) {
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((score / maxScore) * 100)));
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
  return { ok: true, total: normalizeScore(total, LEGACY_MAX_SCORE_WITHOUT_BUDGET), normalizedAnswers };
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

  var budget = clean(body.budget, 120);
  answers.push({ question: "Budget", answer: BUDGET_LABELS[budget] || budget || "-", score: 0 });

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

  return { score: normalizeScore(score, BUILD_FORM_MAX_SCORE_WITHOUT_BUDGET), isHardDQ, normalizedAnswers: answers };
}

function optionLabel(value, optionsMap) {
  const key = clean(value, 120);
  if (!key) return "-";
  return optionsMap[key] || key;
}

function explicitSubmissionAnswers(body) {
  const currentProcessLabel = optionLabel(body.currentProcess, {
    chaos: "Spreadsheets & WhatsApp (Chaos)",
    combo: "A combination of unlinked tools",
    paper: "Mostly paper / manual entry",
    existing: "We use existing software, but it's limiting",
    none: "No process currently (Exploring new idea)",
  });
  const complexityLabel = optionLabel(body.complexity, {
    simple: "Focused systems",
    medium: "Medium complexity workflow",
    dq_marketplace: "Mass consumer apps",
    dq_fintech: "Heavy infrastructure",
  });
  const budgetLabel = optionLabel(body.budget, BUDGET_LABELS);
  const decisionLabel = optionLabel(body.decision, {
    "10": "Yes",
    "5": "Partially",
    "0": "No",
  });
  const timelineLabel = optionLabel(body.timeline, {
    dq_immediate: "Need in 7 days",
    "10": "Start immediately (30 Days)",
    "5": "1 – 3 months",
    dq_exploring: "Still exploring ideas",
  });

  return [
    { question: "Submitted - Build description", answer: cleanText(body.buildDesc, 4000) || "-", score: 0 },
    { question: "Submitted - Problem description", answer: cleanText(body.problemDesc, 6000) || "-", score: 0 },
    { question: "Submitted - System users", answer: cleanText(body.systemUsers, 1000) || "-", score: 0 },
    { question: "Submitted - Current process", answer: currentProcessLabel, score: 0 },
    { question: "Submitted - Project complexity", answer: complexityLabel, score: 0 },
    { question: "Submitted - Budget range", answer: budgetLabel, score: 0 },
    { question: "Submitted - Decision maker", answer: decisionLabel, score: 0 },
    { question: "Submitted - Timeline", answer: timelineLabel, score: 0 },
    { question: "Submitted - Website", answer: cleanText(body.website || body.websiteUrl, 500) || "-", score: 0 },
  ];
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
  const isLegacyAnswersSubmission = Array.isArray(body.answers) && body.answers.length === QUESTIONS.length;
  if (!isLegacyAnswersSubmission && !VALID_BUILD_BUDGETS.has(clean(body.budget, 120))) {
    return json(400, { ok: false, error: "A valid budget range is required." });
  }

  let score = 0;
  let normalizedAnswers = [];
  let hardDq = false;
  let submittedSnapshot = [];
  if (isLegacyAnswersSubmission) {
    const answersResult = computeScore(body.answers);
    if (!answersResult.ok) return json(400, { ok: false, error: answersResult.error });
    score = Number(answersResult.total || 0);
    normalizedAnswers = answersResult.normalizedAnswers;
  } else {
    const alt = computeBuildFormScore(body);
    score = Number(alt.score || 0);
    normalizedAnswers = alt.normalizedAnswers;
    hardDq = alt.isHardDQ;
    submittedSnapshot = explicitSubmissionAnswers(body);
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
      answers: normalizedAnswers.concat(submittedSnapshot),
      sourcePath: "/build-scorecard/",
      followUpRequired: band.followUpRequired,
    });

    const answersText = normalizedAnswers
      .map(function (entry, index) { return `Q${index + 1}: ${entry.question}\nAnswer: ${entry.answer} (${entry.score})`; })
      .join("\n\n");
    const submittedText = submittedSnapshot
      .map(function (entry) { return `${entry.question.replace(/^Submitted - /, "")}: ${entry.answer}`; })
      .join("\n");
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
        submittedText ? "Submitted details:\n" + submittedText + "\n" : "",
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
