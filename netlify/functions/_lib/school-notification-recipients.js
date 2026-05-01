function clean(value, max) {
  return String(value || "").trim().slice(0, max || 500);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim().toLowerCase());
}

function parseEmailList(raw) {
  return String(raw || "")
    .split(",")
    .map(function (item) {
      return String(item || "").trim().toLowerCase();
    })
    .filter(function (email) {
      return email && isValidEmail(email);
    });
}

function getSchoolNotificationRecipients() {
  const fallback = "support@tochukwunkwocha.com";
  const configured =
    clean(process.env.SCHOOL_NOTIFICATION_EMAILS, 5000) ||
    clean(process.env.SCHOOL_ALERT_EMAILS, 5000) ||
    clean(process.env.SCHOOL_CALL_ALERT_EMAILS, 5000);
  const emails = parseEmailList(configured || fallback);
  if (!emails.length) return [fallback];
  return Array.from(new Set(emails));
}

module.exports = {
  getSchoolNotificationRecipients,
};
