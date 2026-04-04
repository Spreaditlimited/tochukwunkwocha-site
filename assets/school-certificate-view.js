(function () {
  var statusEl = document.getElementById("certificateStatus");
  var cardEl = document.getElementById("certificateCard");
  var printBtn = document.getElementById("printCertificateBtn");
  var studentNameEl = document.getElementById("certStudentName");
  var courseNameEl = document.getElementById("certCourseName");
  var schoolNameEl = document.getElementById("certSchoolName");
  var certNoEl = document.getElementById("certNo");
  var issuedAtEl = document.getElementById("certIssuedAt");

  function clean(value) {
    return String(value || "").trim();
  }

  function setStatus(text, bad) {
    if (!statusEl) return;
    statusEl.textContent = clean(text);
    statusEl.className = "text-sm mb-3 " + (bad ? "text-red-700" : "text-slate-600");
  }

  function getCertificateNo() {
    var qs = new URLSearchParams(window.location.search || "");
    return clean(qs.get("certificate_no") || qs.get("certificateNo")).toUpperCase();
  }

  function fmtDate(value) {
    if (!value) return "-";
    var d = new Date(value);
    if (!Number.isFinite(d.getTime())) return "-";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }

  async function loadCertificate() {
    var certificateNo = getCertificateNo();
    if (!certificateNo) {
      setStatus("Missing certificate number.", true);
      return;
    }
    setStatus("Loading certificate...", false);
    try {
      var response = await fetch(
        "/.netlify/functions/school-certificate-public?certificate_no=" + encodeURIComponent(certificateNo),
        { method: "GET", credentials: "include", headers: { Accept: "application/json" } }
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
      if (schoolNameEl) schoolNameEl.textContent = clean(cert.schoolName);
      if (certNoEl) certNoEl.textContent = clean(cert.certificateNo);
      if (issuedAtEl) issuedAtEl.textContent = fmtDate(cert.issuedAt);
      if (cardEl) cardEl.classList.remove("hidden");
      setStatus("Certificate verified.", false);
    } catch (error) {
      if (cardEl) cardEl.classList.add("hidden");
      setStatus(error.message || "Could not load certificate.", true);
    }
  }

  if (printBtn) {
    printBtn.addEventListener("click", function () {
      window.print();
    });
  }

  loadCertificate();
})();
