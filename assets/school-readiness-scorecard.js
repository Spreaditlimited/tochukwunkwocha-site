(function () {
  var root = document.getElementById("schoolReadinessApp");
  if (!root) return;

  var QUESTIONS = [
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
        { label: "Positioning the school as innovative and forward looking", score: 8 },
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
        { label: "We would need broad parent level consensus first", score: 2 },
        { label: "There is no clear process yet", score: 0 },
      ],
    },
  ];

  var RESULT_BANDS = {
    ready: {
      min: 72,
      max: 90,
      headline: "Your School Is Ready to Launch",
      explanation:
        "Your answers show strong readiness for Prompt to Profit for Schools. Your school likely has the internal ownership, student access, and implementation structure needed to onboard a first cohort successfully.",
      points: [
        "your school can likely start with a real cohort soon",
        "your internal structure is already strong enough",
        "the next step is rollout planning, not overthinking",
      ],
      primary: { label: "Book Onboarding Call", href: "/schools/book-call/" },
      secondary: { label: "Register School", href: "/schools/login/?mode=register" },
    },
    close: {
      min: 54,
      max: 71,
      headline: "Your School Is Close. You Need a Clear Rollout Plan",
      explanation:
        "Your school shows good potential for successful implementation, but one or two practical issues may slow things down. In most cases, these are easy to fix with the right rollout plan.",
      points: [
        "internal ownership",
        "student laptop access",
        "speed of internal approval",
      ],
      primary: { label: "Book Readiness Call", href: "/schools/book-call/" },
      secondary: { label: "See How It Works", href: "#setup-process" },
    },
    pilot: {
      min: 36,
      max: 53,
      headline: "Your School Can Start, But Begin With a Pilot",
      explanation:
        "Your school is not yet ideal for a full rollout, but that does not mean you should wait. A smaller pilot cohort is likely the best next step and can help you test implementation without stress.",
      points: ["start smaller", "prove engagement first", "use a controlled first cohort before expanding"],
      primary: { label: "Book Pilot Call", href: "/schools/book-call/" },
      secondary: { label: "Get Pilot Guide", href: "#readiness-guide" },
    },
    notReady: {
      min: 0,
      max: 35,
      headline: "Your School Needs a Simple Readiness Plan First",
      explanation:
        "Your school may not be ready to launch immediately, but the gaps are practical and fixable. The main issues are usually ownership, device access, or internal decision structure.",
      points: ["assign internal ownership", "clarify student device access", "simplify internal approval path"],
      primary: { label: "Talk to Us", href: "/schools/book-call/" },
      secondary: { label: "View Readiness Guide", href: "#readiness-guide" },
    },
  };

  var STORAGE_KEY = "school_ai_readiness_progress_v1";
  var SESSION_OPEN_KEY = "school_ai_readiness_open_v1";

  var landingShell = document.getElementById("landingShell");
  var scorecardShell = document.getElementById("scorecardShell");

  var screenIntro = document.getElementById("screenIntro");
  var screenQuestion = document.getElementById("screenQuestion");
  var screenLead = document.getElementById("screenLead");
  var screenResult = document.getElementById("screenResult");

  var beginBtn = document.getElementById("beginScorecardBtn");
  var resumeBtn = document.getElementById("resumeScorecardBtn");
  var restartBtn = document.getElementById("restartScorecardBtn");

  var questionCounter = document.getElementById("questionCounter");
  var questionPrompt = document.getElementById("questionPrompt");
  var questionOptions = document.getElementById("questionOptions");
  var questionProgressFill = document.getElementById("questionProgressFill");
  var questionBackBtn = document.getElementById("questionBackBtn");
  var questionContinueBtn = document.getElementById("questionContinueBtn");
  var finishLaterBtn = document.getElementById("finishLaterBtn");

  var leadForm = document.getElementById("scorecardLeadForm");
  var leadBackBtn = document.getElementById("leadBackBtn");
  var leadStatus = document.getElementById("leadStatus");
  var leadSubmitBtn = document.getElementById("leadSubmitBtn");
  var leadSubmitLabel = leadSubmitBtn ? leadSubmitBtn.querySelector("[data-submit-label]") : null;

  var resultScore = document.getElementById("resultScore");
  var resultHeadline = document.getElementById("resultHeadline");
  var resultExplanation = document.getElementById("resultExplanation");
  var resultPoints = document.getElementById("resultPoints");
  var resultPrimaryCta = document.getElementById("resultPrimaryCta");
  var resultSecondaryCta = document.getElementById("resultSecondaryCta");
  var resultSubmitStatus = document.getElementById("resultSubmitStatus");
  var retakeScorecardBtn = document.getElementById("retakeScorecardBtn");

  var state = {
    answers: new Array(QUESTIONS.length).fill(null),
    currentIndex: 0,
    score: 0,
    bandKey: "notReady",
    lead: null,
    submission: { ok: false, message: "" },
  };

  function setStatusText(el, message, tone) {
    if (!el) return;
    el.textContent = String(message || "");
    el.classList.remove("ok", "error");
    if (tone === "error") el.classList.add("error");
    else if (tone === "ok") el.classList.add("ok");
  }

  function setLeadBusy(busy) {
    if (!leadSubmitBtn) return;
    leadSubmitBtn.disabled = !!busy;
    leadSubmitBtn.style.opacity = busy ? "0.7" : "";
    if (leadSubmitLabel) leadSubmitLabel.textContent = busy ? "Preparing Result..." : "Show My Result";
  }

  function getBandKeyByScore(score) {
    if (score >= RESULT_BANDS.ready.min) return "ready";
    if (score >= RESULT_BANDS.close.min) return "close";
    if (score >= RESULT_BANDS.pilot.min) return "pilot";
    return "notReady";
  }

  function computeScore() {
    var total = 0;
    var i;
    for (i = 0; i < QUESTIONS.length; i += 1) {
      var optionIndex = state.answers[i];
      if (!Number.isInteger(optionIndex)) continue;
      var option = QUESTIONS[i].options[optionIndex];
      if (option) total += Number(option.score || 0);
    }
    state.score = total;
    state.bandKey = getBandKeyByScore(total);
  }

  function persistProgress(stageOverride) {
    try {
      var payload = {
        answers: state.answers,
        currentIndex: state.currentIndex,
        stage: String(stageOverride || "question"),
        savedAt: Date.now(),
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (_error) {
      return;
    }
  }

  function clearProgress() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (_error) {
      return;
    }
  }

  function readProgress() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.answers) || parsed.answers.length !== QUESTIONS.length) return null;
      parsed.currentIndex = Number.isInteger(parsed.currentIndex) ? parsed.currentIndex : 0;
      parsed.stage = parsed.stage === "lead" ? "lead" : "question";
      return parsed;
    } catch (_error) {
      return null;
    }
  }

  function showScreen(name) {
    screenIntro.hidden = name !== "intro";
    screenQuestion.hidden = name !== "question";
    screenLead.hidden = name !== "lead";
    screenResult.hidden = name !== "result";
  }

  function setScorecardOpenSession(open) {
    try {
      if (open) window.sessionStorage.setItem(SESSION_OPEN_KEY, "1");
      else window.sessionStorage.removeItem(SESSION_OPEN_KEY);
    } catch (_error) {
      return;
    }
  }

  function isScorecardOpenSession() {
    try {
      return window.sessionStorage.getItem(SESSION_OPEN_KEY) === "1";
    } catch (_error) {
      return false;
    }
  }

  function restoreFromSavedProgress() {
    var saved = readProgress();
    if (!saved) return false;

    state.answers = saved.answers.slice();
    state.currentIndex = Math.max(0, Math.min(saved.currentIndex, QUESTIONS.length - 1));

    var allAnswered = state.answers.every(function (value) {
      return Number.isInteger(value);
    });

    if (saved.stage === "lead" || allAnswered) {
      openLeadScreen();
    } else {
      showScreen("question");
      renderQuestion();
    }
    return true;
  }

  function enterScorecard(options) {
    var opts = options || {};
    document.body.classList.add("scorecard-mode");
    if (landingShell) landingShell.hidden = true;
    if (scorecardShell) scorecardShell.hidden = false;
    setScorecardOpenSession(true);

    if (opts.resume && restoreFromSavedProgress()) {
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }

    showScreen("intro");
    renderIntro();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function exitScorecard(targetId) {
    document.body.classList.remove("scorecard-mode");
    if (landingShell) landingShell.hidden = false;
    if (scorecardShell) scorecardShell.hidden = true;
    setScorecardOpenSession(false);

    if (targetId) {
      var target = document.querySelector(targetId);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function renderIntro() {
    var saved = readProgress();
    var hasSaved = !!saved;
    if (resumeBtn) resumeBtn.hidden = !hasSaved;
    if (restartBtn) restartBtn.hidden = !hasSaved;
  }

  function restartState() {
    state.answers = new Array(QUESTIONS.length).fill(null);
    state.currentIndex = 0;
    state.score = 0;
    state.bandKey = "notReady";
    state.lead = null;
    state.submission = { ok: false, message: "" };
    if (leadForm) leadForm.reset();
    setStatusText(leadStatus, "", "idle");
    setStatusText(resultSubmitStatus, "", "idle");
    clearProgress();
    setScorecardOpenSession(false);
  }

  function startQuestionFlow() {
    showScreen("question");
    renderQuestion();
  }

  function renderQuestion() {
    var question = QUESTIONS[state.currentIndex];
    var displayIndex = state.currentIndex + 1;
    questionCounter.textContent = "Question " + displayIndex + " of " + QUESTIONS.length;
    questionPrompt.textContent = question.text;
    questionProgressFill.style.width = (displayIndex / QUESTIONS.length) * 100 + "%";

    questionOptions.innerHTML = "";

    question.options.forEach(function (option, optionIndex) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "score-option" + (state.answers[state.currentIndex] === optionIndex ? " active" : "");
      button.textContent = option.label;
      button.setAttribute("aria-pressed", state.answers[state.currentIndex] === optionIndex ? "true" : "false");
      button.addEventListener("click", function () {
        state.answers[state.currentIndex] = optionIndex;
        persistProgress("question");
        renderQuestion();
      });
      questionOptions.appendChild(button);
    });

    questionBackBtn.disabled = state.currentIndex === 0;
    questionContinueBtn.disabled = !Number.isInteger(state.answers[state.currentIndex]);
    questionContinueBtn.textContent = state.currentIndex === QUESTIONS.length - 1 ? "Continue" : "Continue";
  }

  function openLeadScreen() {
    showScreen("lead");
    persistProgress("lead");
    setStatusText(leadStatus, "", "idle");
  }

  function renderResultScreen() {
    computeScore();
    var band = RESULT_BANDS[state.bandKey];

    resultScore.textContent = "Your Score: " + state.score + "/90";
    resultHeadline.textContent = band.headline;
    resultExplanation.textContent = band.explanation;

    resultPoints.innerHTML = "";
    band.points.forEach(function (point) {
      var li = document.createElement("li");
      li.textContent = "• " + point;
      resultPoints.appendChild(li);
    });

    resultPrimaryCta.textContent = band.primary.label;
    resultPrimaryCta.setAttribute("href", band.primary.href);

    resultSecondaryCta.textContent = band.secondary.label;
    resultSecondaryCta.setAttribute("href", band.secondary.href);

    if (state.submission.ok) {
      setStatusText(resultSubmitStatus, "Result sent to your email successfully.", "ok");
    } else if (state.submission.message) {
      setStatusText(resultSubmitStatus, state.submission.message, "error");
    } else {
      setStatusText(resultSubmitStatus, "", "idle");
    }

    showScreen("result");
  }

  function answerSummary() {
    return QUESTIONS.map(function (question, index) {
      var selectedIndex = state.answers[index];
      var selectedOption = Number.isInteger(selectedIndex) ? question.options[selectedIndex] : null;
      return {
        questionIndex: index + 1,
        question: question.text,
        answerIndex: Number.isInteger(selectedIndex) ? selectedIndex : null,
        answer: selectedOption ? selectedOption.label : "",
        score: selectedOption ? selectedOption.score : 0,
      };
    });
  }

  function trackLeadEvent(eventId) {
    var id = String(eventId || "").trim();
    if (!id) return;
    if (typeof window.fbq !== "function") return;

    var storageKey = "meta_lead_sent_" + id;
    try {
      if (window.sessionStorage && window.sessionStorage.getItem(storageKey) === "1") return;
    } catch (_error) {}

    try {
      window.fbq(
        "track",
        "Lead",
        {
          content_name: "Prompt to Profit for Schools Scorecard",
          content_category: "scorecard",
          lead_type: "scorecard_submit",
        },
        { eventID: id }
      );
      try {
        if (window.sessionStorage) window.sessionStorage.setItem(storageKey, "1");
      } catch (_storageError) {}
    } catch (_error) {}
  }

  async function submitLeadAndOpenResult(payload) {
    setLeadBusy(true);
    setStatusText(leadStatus, "", "idle");

    computeScore();

    try {
      var response = await fetch("/.netlify/functions/school-readiness-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: payload.fullName,
          schoolName: payload.schoolName,
          workEmail: payload.workEmail,
          phone: payload.phone,
          role: payload.role,
          studentPopulation: payload.studentPopulation,
          website: payload.website,
          score: state.score,
          bandKey: state.bandKey,
          answers: answerSummary(),
        }),
      });

      var data = await response.json().catch(function () {
        return {};
      });

      if (!response.ok || !data.ok) {
        throw new Error((data && data.error) || "Could not send your result email right now.");
      }

      trackLeadEvent(data && data.meta && data.meta.eventId);
      state.submission = { ok: true, message: "" };
    } catch (error) {
      state.submission = {
        ok: false,
        message: "Your result is ready below. We could not email it yet, so please use the next step button now.",
      };
    } finally {
      setLeadBusy(false);
      clearProgress();
      setScorecardOpenSession(false);
      renderResultScreen();
    }
  }

  root.querySelectorAll("[data-start-scorecard]").forEach(function (button) {
    button.addEventListener("click", function () {
      enterScorecard({ resume: true });
    });
  });

  root.querySelectorAll("[data-exit-scorecard]").forEach(function (button) {
    button.addEventListener("click", function () {
      exitScorecard();
    });
  });

  beginBtn.addEventListener("click", function () {
    restartState();
    startQuestionFlow();
  });

  if (resumeBtn) {
    resumeBtn.addEventListener("click", function () {
      var saved = readProgress();
      if (!saved) {
        restartState();
        startQuestionFlow();
        return;
      }

      state.answers = saved.answers.slice();
      var firstMissingIndex = state.answers.findIndex(function (index) {
        return !Number.isInteger(index);
      });
      if (firstMissingIndex < 0) firstMissingIndex = QUESTIONS.length - 1;
      state.currentIndex = Math.max(0, Math.min(firstMissingIndex, QUESTIONS.length - 1));
      startQuestionFlow();
    });
  }

  if (restartBtn) {
    restartBtn.addEventListener("click", function () {
      restartState();
      startQuestionFlow();
    });
  }

  questionBackBtn.addEventListener("click", function () {
    if (state.currentIndex > 0) {
      state.currentIndex -= 1;
      persistProgress("question");
      renderQuestion();
      return;
    }
    showScreen("intro");
    renderIntro();
  });

  questionContinueBtn.addEventListener("click", function () {
    if (!Number.isInteger(state.answers[state.currentIndex])) return;

    if (state.currentIndex >= QUESTIONS.length - 1) {
      openLeadScreen();
      return;
    }

    state.currentIndex += 1;
    persistProgress("question");
    renderQuestion();
  });

  finishLaterBtn.addEventListener("click", function () {
    persistProgress("question");
    exitScorecard();
  });

  leadBackBtn.addEventListener("click", function () {
    showScreen("question");
    state.currentIndex = QUESTIONS.length - 1;
    renderQuestion();
  });

  if (leadForm) {
    leadForm.addEventListener("submit", function (event) {
      event.preventDefault();
      setStatusText(leadStatus, "", "idle");

      var payload = {
        fullName: String((leadForm.fullName && leadForm.fullName.value) || "").trim(),
        schoolName: String((leadForm.schoolName && leadForm.schoolName.value) || "").trim(),
        workEmail: String((leadForm.workEmail && leadForm.workEmail.value) || "").trim(),
        phone: String((leadForm.phone && leadForm.phone.value) || "").trim(),
        role: String((leadForm.role && leadForm.role.value) || "").trim(),
        studentPopulation: String((leadForm.studentPopulation && leadForm.studentPopulation.value) || "").trim(),
        website: String((leadForm.website && leadForm.website.value) || "").trim(),
      };

      if (!payload.fullName || !payload.schoolName || !payload.workEmail || !payload.phone || !payload.role || !payload.studentPopulation) {
        setStatusText(leadStatus, "Please complete all required fields before viewing your result.", "error");
        return;
      }

      state.lead = payload;
      submitLeadAndOpenResult(payload);
    });
  }

  if (retakeScorecardBtn) {
    retakeScorecardBtn.addEventListener("click", function () {
      restartState();
      startQuestionFlow();
    });
  }

  [resultPrimaryCta, resultSecondaryCta].forEach(function (link) {
    if (!link) return;
    link.addEventListener("click", function (event) {
      var href = link.getAttribute("href") || "";
      if (href.charAt(0) === "#") {
        event.preventDefault();
        exitScorecard(href);
      }
    });
  });

  if (window.location.search.indexOf("scorecard=1") > -1) {
    enterScorecard({ resume: true });
    return;
  }

  if (isScorecardOpenSession()) {
    enterScorecard({ resume: true });
  }
})();
