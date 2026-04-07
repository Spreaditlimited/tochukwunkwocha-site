(function () {
  var statusEl = document.getElementById("certificateStatus");
  var cardEl = document.getElementById("certificateCard");
  var printBtn = document.getElementById("printCertificateBtn");
  var studentNameEl = document.getElementById("certStudentName");
  var courseNameEl = document.getElementById("certCourseName");
  var certNoEl = document.getElementById("certNo");
  var issuedAtEl = document.getElementById("certIssuedAt");

  function clean(value) {
    return String(value || "").trim();
  }

  function fmtDate(value) {
    if (!value) return "-";
    var d = new Date(value);
    if (!Number.isFinite(d.getTime())) return "-";
    return d.toLocaleString();
  }

  function getCertificateNo() {
    var qs = new URLSearchParams(window.location.search || "");
    return clean(qs.get("certificate_no") || qs.get("certificateNo")).toUpperCase();
  }

  function setStatus(text, bad) {
    if (!statusEl) return;
    statusEl.textContent = clean(text);
    statusEl.className = "text-sm mb-3 " + (bad ? "text-red-600" : "text-slate-600");
  }

  async function load() {
    var certificateNo = getCertificateNo();
    if (!certificateNo) {
      setStatus("Missing certificate number.", true);
      return;
    }
    setStatus("Loading certificate...", false);
    try {
      var response = await fetch(
        "/.netlify/functions/student-certificate-public?certificate_no=" + encodeURIComponent(certificateNo),
        {
          method: "GET",
          headers: { Accept: "application/json" },
        }
      );
      var data = await response.json().catch(function () {
        return null;
      });
      if (!response.ok || !data || data.ok !== true || !data.certificate) {
        throw new Error((data && data.error) || "Could not load certificate.");
      }
      var cert = data.certificate;
      if (studentNameEl) studentNameEl.textContent = clean(cert.studentName);
      if (courseNameEl) courseNameEl.textContent = clean(cert.courseName);
      if (certNoEl) certNoEl.textContent = clean(cert.certificateNo);
      if (issuedAtEl) issuedAtEl.textContent = fmtDate(cert.issuedAt);
      if (cardEl) cardEl.classList.remove("hidden");
      setStatus("Certificate ready. Use Print / Save PDF to download.", false);
    } catch (error) {
      setStatus(error.message || "Could not load certificate.", true);
    }
  }

  if (printBtn) {
    printBtn.addEventListener("click", function () {
      window.print();
    });
  }

  load();
})();
