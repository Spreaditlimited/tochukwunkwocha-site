(function () {
  var trainedValueEl = document.getElementById("trustTrainedValue");
  var trainedLabelEl = document.getElementById("trustTrainedLabel");
  var reviewsValueEl = document.getElementById("trustReviewsValue");
  var reviewsLabelEl = document.getElementById("trustReviewsLabel");
  var outputValueEl = document.getElementById("trustOutputValue");
  var outputLabelEl = document.getElementById("trustOutputLabel");

  if (
    !trainedValueEl ||
    !trainedLabelEl ||
    !reviewsValueEl ||
    !reviewsLabelEl ||
    !outputValueEl ||
    !outputLabelEl
  ) {
    return;
  }

  function setText(el, value, max) {
    if (!el) return;
    var text = String(value || "").trim().slice(0, max || 240);
    if (!text) return;
    el.textContent = text;
  }

  async function loadConfig() {
    var res = await fetch("/.netlify/functions/schools-landing-config", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    var data = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !data || data.ok !== true || !data.trust) return;

    var trust = data.trust || {};
    setText(trainedValueEl, trust.trainedValue, 80);
    setText(trainedLabelEl, trust.trainedLabel, 240);
    setText(reviewsValueEl, trust.reviewsValue, 80);
    setText(reviewsLabelEl, trust.reviewsLabel, 240);
    setText(outputValueEl, trust.outputValue, 80);
    setText(outputLabelEl, trust.outputLabel, 240);
  }

  loadConfig().catch(function () {});
})();

