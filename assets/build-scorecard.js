(function () {
  var questionsRoot = document.getElementById("questions");
  var form = document.getElementById("buildScorecardForm");
  if (!questionsRoot || !form) return;

  var QUESTIONS = [
    { text: "Do you have a clear workflow problem to fix now?", options: ["Yes, urgent", "Somewhat", "Not clear"] },
    { text: "How soon do you want to start?", options: ["Immediately", "Within 30 days", "Later"] },
    { text: "Decision ownership", options: ["I decide", "Small group", "Unclear"] },
    { text: "Current process maturity", options: ["Documented", "Partially documented", "Mostly ad hoc"] },
    { text: "Team readiness", options: ["Ready to adopt", "Needs support", "Not ready"] },
    { text: "Data availability", options: ["Data exists and accessible", "Some data gaps", "Major gaps"] },
    { text: "Scope clarity", options: ["Single clear use-case", "Few use-cases", "Broad/unclear"] },
    { text: "Budget intent", options: ["Budget approved", "Budget likely", "No budget yet"] },
    { text: "Operational pain", options: ["High", "Medium", "Low"] },
    { text: "Success urgency", options: ["Need result in 30 days", "Flexible", "No urgency"] },
  ];

  QUESTIONS.forEach(function (q, i) {
    var wrap = document.createElement("fieldset");
    wrap.className = "rounded-xl border border-gray-200 p-4";
    wrap.innerHTML = '<legend class="px-1 text-sm font-semibold">' + (i + 1) + '. ' + q.text + '</legend>';
    q.options.forEach(function (label, idx) {
      var id = "q" + i + "_" + idx;
      var row = document.createElement("label");
      row.className = "mt-2 flex items-center gap-2 text-sm";
      row.setAttribute("for", id);
      row.innerHTML = '<input required type="radio" name="q' + i + '" id="' + id + '" value="' + idx + '" />' + label;
      wrap.appendChild(row);
    });
    questionsRoot.appendChild(wrap);
  });

  var status = document.getElementById("status");
  var submitBtn = document.getElementById("submitBtn");
  var result = document.getElementById("result");
  var scoreLine = document.getElementById("scoreLine");
  var headline = document.getElementById("headline");
  var message = document.getElementById("message");
  var cta = document.getElementById("primaryCta");

  function buildAnswers(fd) {
    return QUESTIONS.map(function (_q, i) {
      return { answerIndex: Number(fd.get("q" + i)) };
    });
  }

  function renderResult(data) {
    result.hidden = false;
    scoreLine.textContent = "Score: " + data.score + "/100";
    headline.textContent = data.headline || "Result";
    if (data.qualified) {
      message.textContent = "You qualify for the next step.";
      cta.hidden = false;
      cta.href = data.bookingUrl;
      cta.textContent = "Book Paid Discovery Call";
    } else if (data.score >= 50) {
      message.textContent = "Thank you. Your application is in manual review. We will contact you.";
      cta.hidden = true;
    } else {
      message.textContent = "Thank you for applying. At this stage, this service is not the best fit.";
      cta.hidden = true;
    }
    result.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    status.textContent = "Submitting...";
    submitBtn.disabled = true;

    var fd = new FormData(form);

    try {
      var res = await fetch("/.netlify/functions/build-scorecard-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: String(fd.get("fullName") || "").trim(),
          businessName: String(fd.get("businessName") || "").trim(),
          workEmail: String(fd.get("workEmail") || "").trim(),
          phone: String(fd.get("phone") || "").trim(),
          role: String(fd.get("role") || "").trim(),
          companySize: String(fd.get("companySize") || "").trim(),
          answers: buildAnswers(fd),
        }),
      });
      var data = await res.json();
      if (!res.ok || !data.ok) throw new Error((data && data.error) || "Submission failed");
      renderResult(data);
      status.textContent = "";
    } catch (err) {
      status.textContent = err.message || "Could not submit right now.";
    } finally {
      submitBtn.disabled = false;
    }
  });
})();
