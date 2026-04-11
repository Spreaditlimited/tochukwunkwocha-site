(function () {
  var STORAGE_KEY = "tws_student_device_id_v1";

  function randomId() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return "sd_" + window.crypto.randomUUID().replace(/-/g, "");
      }
      if (window.crypto && typeof window.crypto.getRandomValues === "function") {
        var arr = new Uint8Array(24);
        window.crypto.getRandomValues(arr);
        return "sd_" + Array.prototype.map.call(arr, function (n) {
          return n.toString(16).padStart(2, "0");
        }).join("");
      }
    } catch (_error) {}
    return "sd_" + String(Date.now()) + "_" + String(Math.random()).slice(2);
  }

  function readStored() {
    try {
      return String(window.localStorage.getItem(STORAGE_KEY) || "").trim();
    } catch (_error) {
      return "";
    }
  }

  function saveStored(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value || ""));
    } catch (_error) {}
  }

  function getDeviceId() {
    var existing = readStored();
    if (existing) return existing;
    var next = randomId();
    saveStored(next);
    return next;
  }

  window.twsStudentDeviceId = getDeviceId;
})();
