(function () {
  var titleEl = document.getElementById("playerCourseTitle");
  var metaEl = document.getElementById("playerCourseMeta");
  var statusEl = document.getElementById("playerStatus");
  var sidebarEl = document.getElementById("playerSidebar");
  var paneEl = document.getElementById("playerPane");
  var emptyEl = document.getElementById("playerEmpty");
  var emptyTitleEl = document.getElementById("playerEmptyTitle");
  var emptyBodyEl = document.getElementById("playerEmptyBody");
  var emptyHintEl = document.getElementById("playerEmptyHint");
  var emptyChipEl = document.getElementById("playerEmptyChip");
  var emptyRefreshBtn = document.getElementById("playerEmptyRefreshBtn");
  var frameHostEl = document.getElementById("lessonVideoFrameHost");
  var watermarkEl = document.getElementById("playerWatermark");
  var lessonTitleEl = document.getElementById("lessonTitle");
  var lessonMetaEl = document.getElementById("lessonMeta");
  var lessonNotesEl = document.getElementById("lessonNotes");
  var lessonA11yToolsEl = document.getElementById("lessonAccessibilityTools");
  var lessonA11yStatusBadgeEl = document.getElementById("lessonA11yStatusBadge");
  var lessonCaptionsBadgeEl = document.getElementById("lessonCaptionsBadge");
  var toggleTranscriptBtn = document.getElementById("toggleTranscriptBtn");
  var requestTranscriptBtn = document.getElementById("requestTranscriptBtn");
  var toggleAudioDescriptionBtn = document.getElementById("toggleAudioDescriptionBtn");
  var toggleSignLanguageBtn = document.getElementById("toggleSignLanguageBtn");
  var signLanguageLink = document.getElementById("signLanguageLink");
  var transcriptPanelEl = document.getElementById("lessonTranscriptPanel");
  var transcriptTextEl = document.getElementById("lessonTranscriptText");
  var transcriptSearchInput = document.getElementById("transcriptSearchInput");
  var audioDescriptionPanelEl = document.getElementById("lessonAudioDescriptionPanel");
  var audioDescriptionTextEl = document.getElementById("lessonAudioDescriptionText");
  var signLanguagePanelEl = document.getElementById("lessonSignLanguagePanel");
  var signLanguagePanelLink = document.getElementById("signLanguagePanelLink");
  var signLanguageFrameEl = document.getElementById("lessonSignLanguageFrame");
  var signLanguageVideoEl = document.getElementById("lessonSignLanguageVideo");
  var lessonLiveRegionEl = document.getElementById("lessonLiveRegion");
  var markBtn = document.getElementById("markCompleteBtn");
  var progressBarEl = document.getElementById("playerProgressBar");
  var progressTextEl = document.getElementById("playerProgressText");
  var completionBadgeEl = document.getElementById("playerCompletionBadge");
  var retryBtn = document.getElementById("playerRetryBtn");
  var prevLessonBtn = document.getElementById("prevLessonBtn");
  var nextLessonBtn = document.getElementById("nextLessonBtn");
  var skeletonEl = document.getElementById("playerSkeleton");
  var assignmentCardEl = document.getElementById("lessonAssignmentsCard");
  var assignmentStatusChipEl = document.getElementById("assignmentStatusChip");
  var assignmentTypeSelectEl = document.getElementById("assignmentTypeSelect");
  var assignmentLessonContextEl = document.getElementById("assignmentLessonContext");
  var assignmentTextInputEl = document.getElementById("assignmentTextInput");
  var assignmentLinkInputEl = document.getElementById("assignmentLinkInput");
  var assignmentScreenshotWrapEl = document.getElementById("assignmentScreenshotWrap");
  var assignmentScreenshotInputEl = document.getElementById("assignmentScreenshotInput");
  var assignmentScreenshotPreviewEl = document.getElementById("assignmentScreenshotPreview");
  var assignmentSubmitBtnEl = document.getElementById("assignmentSubmitBtn");
  var assignmentRefreshBtnEl = document.getElementById("assignmentRefreshBtn");
  var assignmentMessageEl = document.getElementById("assignmentMessage");
  var assignmentRowsEl = document.getElementById("assignmentRows");
  var communityCardEl = document.getElementById("lessonCommunityCard");
  var communityStatusChipEl = document.getElementById("communityStatusChip");
  var communityTypeSelectEl = document.getElementById("communityTypeSelect");
  var communityLessonContextEl = document.getElementById("communityLessonContext");
  var communityTitleInputEl = document.getElementById("communityTitleInput");
  var communityBodyInputEl = document.getElementById("communityBodyInput");
  var communityPostBtnEl = document.getElementById("communityPostBtn");
  var communityRefreshBtnEl = document.getElementById("communityRefreshBtn");
  var communityMessageEl = document.getElementById("communityMessage");
  var communitySearchInputEl = document.getElementById("communitySearchInput");
  var communityThreadListEl = document.getElementById("communityThreadList");
  var confirmModalEl = document.getElementById("playerConfirmModal");
  var confirmModalBackdropEl = document.getElementById("playerConfirmModalBackdrop");
  var confirmModalCloseEl = document.getElementById("playerConfirmModalClose");
  var confirmModalCancelEl = document.getElementById("playerConfirmModalCancel");
  var confirmModalConfirmEl = document.getElementById("playerConfirmModalConfirm");
  var confirmModalTitleEl = document.getElementById("playerConfirmModalTitle");
  var confirmModalBodyEl = document.getElementById("playerConfirmModalBody");
  var editModalEl = document.getElementById("playerEditModal");
  var editModalBackdropEl = document.getElementById("playerEditModalBackdrop");
  var editModalCloseEl = document.getElementById("playerEditModalClose");
  var editModalCancelEl = document.getElementById("playerEditModalCancel");
  var editModalSaveEl = document.getElementById("playerEditModalSave");
  var editModalTitleEl = document.getElementById("playerEditModalTitle");
  var editModalTitleWrapEl = document.getElementById("playerEditModalTitleWrap");
  var editModalTitleInputEl = document.getElementById("playerEditModalTitleInput");
  var editModalBodyInputEl = document.getElementById("playerEditModalBodyInput");

  var state = {
    courseSlug: "",
    modules: [],
    lessonById: new Map(),
    activeLessonId: 0,
    currentLesson: null,
    embedFallbackTimer: null,
    iframeEl: null,
    activeEmbedToken: 0,
    activeLessonIndex: -1,
    lessonOrder: [],
    playbackCache: new Map(),
    playbackRefreshTimer: null,
    watermarkTimer: null,
    watermarkIndex: 0,
    account: null,
    pendingWatchSeconds: 0,
    lastTrackedPlayerSecond: null,
    isPlaying: false,
    watchFlushTimer: null,
    watchSaveInFlight: false,
    lastWatchSaveAtMs: 0,
    playerSdkPromise: null,
    playerApi: null,
    initialLessonId: 0,
    lastErroredLessonId: 0,
    transcriptSourceText: "",
    transcriptLoadedLessonId: 0,
    transcriptFetchInFlight: false,
    transcriptAccessAllowed: false,
    transcriptAccessStatus: "none",
    audioDescriptionSourceText: "",
    signLanguageSourceUrl: "",
    features: null,
    assignmentItems: [],
    assignmentScreenshotUploads: [],
    communityThreads: [],
    communityRepliesByThread: new Map(),
    communitySearchTerm: "",
    confirmResolver: null,
    editResolver: null,
  };

  var WATCH_HEARTBEAT_SECONDS = 15;
  var WATCH_HEARTBEAT_INTERVAL_MS = 15000;
  var WATCH_HEARTBEAT_MIN_GAP_MS = 10000;

  function clean(value) {
    return String(value || "").trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fmtDate(value) {
    if (!value) return "";
    var d = new Date(value);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleString();
  }

  function parseFutureAccessAt(message) {
    var text = clean(message);
    if (!text) return "";
    var match = text.match(/^Course access begins on\s+(.+?)\.?$/i);
    if (!match || !match[1]) return "";
    return clean(match[1]).replace(/\.$/, "");
  }

  function friendlyAccessDate(raw) {
    var value = clean(raw);
    if (!value) return "";
    var parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) {
      parsed = new Date(value.replace(" ", "T"));
    }
    if (!Number.isFinite(parsed.getTime())) return value;
    return parsed.toLocaleString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function isFutureAccessMessage(message) {
    return !!parseFutureAccessAt(message);
  }

  function showFutureAccessState(message) {
    var rawAt = parseFutureAccessAt(message);
    var friendlyAt = friendlyAccessDate(rawAt);
    setCourseMetaText("Access scheduled: " + (friendlyAt || rawAt));
    setStatus("Course access is scheduled for " + (friendlyAt || rawAt) + ".", false);
    showEmptyState({
      variant: "info",
      chip: "Scheduled access",
      title: "Your course unlocks soon",
      body: "Your access is confirmed and will start on " + (friendlyAt || rawAt) + ".",
      hint: "No action is required now. Please return at that time or check My Courses for updates.",
    });
    if (paneEl) paneEl.hidden = true;
  }

  function sanitizeLabel(value, max) {
    return clean(value || "").replace(/\s+/g, " ").slice(0, max || 120);
  }

  function compactTimeLabel(date) {
    var d = date instanceof Date ? date : new Date();
    if (!Number.isFinite(d.getTime())) return "";
    var hh = String(d.getHours()).padStart(2, "0");
    var mm = String(d.getMinutes()).padStart(2, "0");
    var ss = String(d.getSeconds()).padStart(2, "0");
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") + " " + hh + ":" + mm + ":" + ss;
  }

  function stopWatermarkTicker() {
    if (state.watermarkTimer) {
      clearInterval(state.watermarkTimer);
      state.watermarkTimer = null;
    }
  }

  function renderWatermarkStamp() {
    if (!watermarkEl) return;
    var email = sanitizeLabel(state.account && state.account.email, 180);
    if (!email) {
      watermarkEl.hidden = true;
      watermarkEl.setAttribute("aria-hidden", "true");
      watermarkEl.textContent = "";
      return;
    }
    var name = sanitizeLabel(state.account && state.account.full_name, 80);
    var who = name ? (name + " (" + email + ")") : email;
    var stamp = compactTimeLabel(new Date());
    watermarkEl.textContent = who + " • " + stamp;
    var positions = ["tr", "bl", "tl", "br", "c"];
    var idx = Math.abs(Number(state.watermarkIndex || 0)) % positions.length;
    watermarkEl.setAttribute("data-pos", positions[idx]);
    watermarkEl.hidden = false;
    watermarkEl.setAttribute("aria-hidden", "false");
    state.watermarkIndex = idx + 1;
  }

  function startWatermarkTicker() {
    stopWatermarkTicker();
    renderWatermarkStamp();
    state.watermarkTimer = setInterval(function () {
      renderWatermarkStamp();
    }, 30000);
  }

  function queryCourseSlug() {
    var qs = new URLSearchParams(window.location.search || "");
    var slug = clean(qs.get("course")).toLowerCase();
    return slug;
  }

  function queryLessonId() {
    var qs = new URLSearchParams(window.location.search || "");
    var lessonId = Number(qs.get("lesson") || 0);
    if (!Number.isFinite(lessonId) || lessonId <= 0) return 0;
    return Math.trunc(lessonId);
  }

  function setStatus(text, bad) {
    if (!statusEl) return;
    statusEl.textContent = clean(text);
    statusEl.className = "text-sm font-medium mb-3 " + (bad ? "text-red-600" : "text-gray-600");
  }

  function setCourseMetaText(text) {
    if (!metaEl) return;
    metaEl.textContent = clean(text);
  }

  function showEmptyState(config) {
    if (!emptyEl) return;
    var data = config || {};
    var variant = clean(data.variant || "info").toLowerCase();
    if (variant !== "error") variant = "info";
    emptyEl.setAttribute("data-variant", variant);
    if (emptyTitleEl) emptyTitleEl.textContent = clean(data.title || "Lessons are not available yet");
    if (emptyBodyEl) emptyBodyEl.textContent = clean(data.body || "This course is currently empty. Lessons will appear here once they are published.");
    if (emptyHintEl) emptyHintEl.textContent = clean(data.hint || "If this is unexpected, refresh this page or return to My Courses.");
    if (emptyChipEl) emptyChipEl.textContent = clean(data.chip || (variant === "error" ? "Action needed" : "Course update"));
    emptyEl.hidden = false;
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function triggerCaptureShield() {
    if (!paneEl) return;
    var existing = paneEl.querySelector('[data-capture-shield="true"]');
    if (existing) return;
    var shield = document.createElement("div");
    shield.setAttribute("data-capture-shield", "true");
    shield.className = "fixed inset-0 z-[120] flex items-center justify-center bg-black/90 p-6 text-center text-white";
    shield.innerHTML = '<div class="max-w-xl rounded-2xl border border-white/25 bg-black/55 px-6 py-5"><p class="text-sm font-semibold uppercase tracking-wider text-white/70">Protected Content</p><p class="mt-2 text-lg font-bold">Screen capture is disabled on this page.</p><p class="mt-2 text-sm text-white/80">If you need notes, use the in-app tools only.</p></div>';
    document.body.appendChild(shield);
    setTimeout(function () {
      if (shield && shield.parentNode) shield.parentNode.removeChild(shield);
    }, 1800);
  }

  function closeTranscriptPanel() {
    if (transcriptPanelEl) transcriptPanelEl.hidden = true;
    if (toggleTranscriptBtn) toggleTranscriptBtn.textContent = "Open transcript";
  }

  async function fetchTranscriptForLesson(lessonId) {
    var id = Number(lessonId || 0);
    if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid lesson id.");
    if (state.transcriptFetchInFlight) return;
    state.transcriptFetchInFlight = true;
    try {
      var payload = await api("/.netlify/functions/user-learning-transcript", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ lesson_id: id }),
      });
      var text = clean(payload && payload.transcript_text || "");
      state.transcriptSourceText = text;
      state.transcriptLoadedLessonId = id;
      renderTranscriptText(transcriptSearchInput ? transcriptSearchInput.value || "" : "");
      return text;
    } finally {
      state.transcriptFetchInFlight = false;
    }
  }

  async function requestTranscriptAccessForLesson(lessonId) {
    var id = Number(lessonId || 0);
    if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid lesson id.");
    var payload = await api("/.netlify/functions/user-learning-transcript-request", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ lesson_id: id }),
    });
    state.transcriptAccessAllowed = false;
    state.transcriptAccessStatus = clean(payload && payload.transcript_access && payload.transcript_access.status || "pending").toLowerCase() || "pending";
    return payload;
  }

  function closeAudioDescriptionPanel() {
    if (audioDescriptionPanelEl) audioDescriptionPanelEl.hidden = true;
    if (toggleAudioDescriptionBtn) toggleAudioDescriptionBtn.textContent = "Open audio description";
  }

  function closeSignLanguagePanel() {
    if (signLanguagePanelEl) signLanguagePanelEl.hidden = true;
    if (toggleSignLanguageBtn) toggleSignLanguageBtn.textContent = "Open sign language";
  }

  function isLikelyCloudflareUid(value) {
    var raw = clean(value);
    return /^[a-z0-9]{20,40}$/i.test(raw);
  }

  function normalizeSignLanguageSource(rawUrl) {
    var raw = clean(rawUrl);
    if (!raw) return "";
    if (isLikelyCloudflareUid(raw)) {
      return "https://iframe.videodelivery.net/" + encodeURIComponent(raw);
    }
    return raw;
  }

  function signLanguagePresentation(url) {
    var source = normalizeSignLanguageSource(url);
    if (!source) return { src: "", type: "none" };
    var lowered = source.toLowerCase();
    if (lowered.indexOf("youtube.com/watch?v=") !== -1) {
      var m = source.match(/[?&]v=([^&#]+)/);
      if (m && m[1]) {
        return { src: "https://www.youtube.com/embed/" + encodeURIComponent(m[1]), type: "iframe" };
      }
    }
    if (lowered.indexOf("youtu.be/") !== -1) {
      var y = source.split("youtu.be/")[1] || "";
      var yid = y.split(/[?&#]/)[0];
      if (yid) return { src: "https://www.youtube.com/embed/" + encodeURIComponent(yid), type: "iframe" };
    }
    if (lowered.indexOf("vimeo.com/") !== -1 && lowered.indexOf("player.vimeo.com/video/") === -1) {
      var vm = source.match(/vimeo\.com\/(\d+)/i);
      if (vm && vm[1]) return { src: "https://player.vimeo.com/video/" + encodeURIComponent(vm[1]), type: "iframe" };
    }
    if (
      lowered.indexOf("iframe.videodelivery.net/") !== -1 ||
      lowered.indexOf("youtube.com/embed/") !== -1 ||
      lowered.indexOf("player.vimeo.com/video/") !== -1
    ) {
      return { src: source, type: "iframe" };
    }
    if (
      /\.mp4(?:$|\?)/i.test(source) ||
      /\.webm(?:$|\?)/i.test(source) ||
      /\.ogg(?:$|\?)/i.test(source) ||
      /\.m3u8(?:$|\?)/i.test(source)
    ) {
      return { src: source, type: "video" };
    }
    return { src: source, type: "iframe" };
  }

  function renderSignLanguageMedia(url) {
    var media = signLanguagePresentation(url);
    if (signLanguageFrameEl) {
      signLanguageFrameEl.hidden = true;
      signLanguageFrameEl.removeAttribute("src");
    }
    if (signLanguageVideoEl) {
      signLanguageVideoEl.hidden = true;
      signLanguageVideoEl.removeAttribute("src");
      try { signLanguageVideoEl.load(); } catch (_error) {}
    }
    if (!media.src) return;
    if (media.type === "video") {
      if (signLanguageVideoEl) {
        signLanguageVideoEl.src = media.src;
        signLanguageVideoEl.hidden = false;
      }
      return;
    }
    if (signLanguageFrameEl) {
      signLanguageFrameEl.src = media.src;
      signLanguageFrameEl.hidden = false;
    }
  }

  function renderTranscriptText(query) {
    if (!transcriptTextEl) return;
    var source = clean(state.transcriptSourceText || "");
    if (!source) {
      transcriptTextEl.textContent = "Transcript is not available for this lesson yet.";
      return;
    }
    var term = clean(query || "").toLowerCase();
    if (!term) {
      transcriptTextEl.textContent = source;
      return;
    }
    var lines = source.split(/\r?\n/);
    var filtered = lines.filter(function (line) {
      return String(line || "").toLowerCase().indexOf(term) !== -1;
    });
    transcriptTextEl.textContent = filtered.length
      ? filtered.join("\n")
      : 'No transcript lines match "' + clean(query || "") + '".';
  }

  function renderLessonAccessibility(lesson) {
    var a11y = lesson && lesson.accessibility && typeof lesson.accessibility === "object"
      ? lesson.accessibility
      : {};
    var captionsUrl = clean(a11y.captions_vtt_url || "");
    var transcriptText = clean(a11y.transcript_text || "");
    var transcriptAvailable = !!(a11y.transcript_available || transcriptText);
    var transcriptAllowed = !!state.transcriptAccessAllowed;
    var audioDescriptionText = clean(a11y.audio_description_text || "");
    var signLanguageUrl = clean(a11y.sign_language_video_url || "");
    var statusRaw = clean(a11y.status || "draft").toLowerCase();
    var statusLabel = statusRaw === "ready"
      ? "Ready"
      : (statusRaw === "in_progress" ? "In Progress" : (statusRaw === "blocked" ? "Blocked" : "Draft"));
    var captionsLanguages = safeArray(a11y.captions_languages).map(function (item) {
      return clean(item, 40);
    }).filter(Boolean);

    state.transcriptSourceText = "";
    state.transcriptLoadedLessonId = 0;
    state.audioDescriptionSourceText = audioDescriptionText;
    state.signLanguageSourceUrl = signLanguageUrl;

    if (lessonA11yToolsEl) {
      lessonA11yToolsEl.hidden = !(captionsUrl || transcriptAvailable || audioDescriptionText || signLanguageUrl || statusLabel);
    }
    if (lessonA11yStatusBadgeEl) {
      lessonA11yStatusBadgeEl.textContent = "Accessibility: " + statusLabel;
    }
    if (lessonCaptionsBadgeEl) {
      var captionsLabel = captionsUrl
        ? ("Captions available" + (captionsLanguages.length ? " (" + captionsLanguages.join(", ") + ")" : ""))
        : "";
      lessonCaptionsBadgeEl.textContent = captionsLabel || "Captions available";
      lessonCaptionsBadgeEl.hidden = !captionsUrl;
    }
    if (toggleTranscriptBtn) {
      toggleTranscriptBtn.hidden = !(transcriptAvailable && transcriptAllowed);
      toggleTranscriptBtn.disabled = !transcriptAllowed;
      toggleTranscriptBtn.textContent = transcriptPanelEl && !transcriptPanelEl.hidden ? "Close transcript" : "Open transcript";
    }
    if (requestTranscriptBtn) {
      requestTranscriptBtn.hidden = !(transcriptAvailable && !transcriptAllowed);
      requestTranscriptBtn.disabled = state.transcriptAccessStatus === "pending";
      requestTranscriptBtn.textContent = state.transcriptAccessStatus === "pending" ? "Transcript request pending" : "Request transcript access";
    }
    if (toggleAudioDescriptionBtn) {
      toggleAudioDescriptionBtn.hidden = !audioDescriptionText;
      toggleAudioDescriptionBtn.textContent = audioDescriptionPanelEl && !audioDescriptionPanelEl.hidden ? "Close audio description" : "Open audio description";
    }
    if (toggleSignLanguageBtn) {
      toggleSignLanguageBtn.hidden = true;
      toggleSignLanguageBtn.disabled = true;
      toggleSignLanguageBtn.textContent = "Sign language unavailable";
    }
    if (signLanguageLink) {
      signLanguageLink.hidden = true;
    }
    if (signLanguagePanelLink) {
      signLanguagePanelLink.hidden = true;
    }
    if (audioDescriptionTextEl) {
      audioDescriptionTextEl.textContent = audioDescriptionText || "Audio description is not available for this lesson yet.";
    }
    if (transcriptSearchInput) transcriptSearchInput.value = "";
    if (transcriptTextEl) {
      if (!transcriptAvailable) {
        transcriptTextEl.textContent = "Transcript is not available for this lesson yet.";
      } else if (!transcriptAllowed) {
        transcriptTextEl.textContent = "Transcript access requires approved accessibility accommodation.";
      } else {
        transcriptTextEl.textContent = "Open transcript to load secure text.";
      }
    }
    if (transcriptPanelEl) {
      transcriptPanelEl.hidden = true;
    }
    if (toggleTranscriptBtn) {
      toggleTranscriptBtn.textContent = transcriptPanelEl && !transcriptPanelEl.hidden ? "Close transcript" : "Open transcript";
    }
    closeAudioDescriptionPanel();
    closeSignLanguagePanel();
    if (signLanguagePanelEl) signLanguagePanelEl.hidden = true;
    renderSignLanguageMedia(signLanguageUrl);
  }

  function announceLesson(lesson) {
    if (!lessonLiveRegionEl) return;
    var title = clean(lesson && lesson.title || "Lesson");
    var note = clean(lesson && lesson.notes || "");
    lessonLiveRegionEl.textContent = "Now viewing " + title + (note ? ". Lesson notes available." : ".");
  }

  function setPlayerSkeleton(visible) {
    if (!skeletonEl) return;
    skeletonEl.hidden = !visible;
  }

  function loadCloudflarePlayerSdk() {
    if (window.Stream && typeof window.Stream === "function") {
      return Promise.resolve(window.Stream);
    }
    if (state.playerSdkPromise) return state.playerSdkPromise;
    state.playerSdkPromise = new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-cf-stream-sdk="true"]');
      if (existing) {
        existing.addEventListener("load", function () {
          if (window.Stream && typeof window.Stream === "function") resolve(window.Stream);
        });
        existing.addEventListener("error", function () {
          reject(new Error("Could not load video SDK."));
        });
        return;
      }
      var script = document.createElement("script");
      script.src = "https://embed.cloudflarestream.com/embed/sdk.latest.js";
      script.async = true;
      script.defer = true;
      script.setAttribute("data-cf-stream-sdk", "true");
      script.addEventListener("load", function () {
        if (window.Stream && typeof window.Stream === "function") {
          resolve(window.Stream);
          return;
        }
        reject(new Error("Could not initialize video SDK."));
      });
      script.addEventListener("error", function () {
        reject(new Error("Could not load video SDK."));
      });
      document.head.appendChild(script);
    }).catch(function (error) {
      state.playerSdkPromise = null;
      throw error;
    });
    return state.playerSdkPromise;
  }

  function queueWatchSeconds(seconds) {
    var delta = Number(seconds);
    if (!Number.isFinite(delta) || delta <= 0) return;
    state.pendingWatchSeconds += delta;
  }

  function parsePlayerTimeSeconds(payload) {
    if (Number.isFinite(Number(payload))) return Number(payload);
    if (!payload || typeof payload !== "object") return NaN;
    if (Number.isFinite(Number(payload.currentTime))) return Number(payload.currentTime);
    if (Number.isFinite(Number(payload.time))) return Number(payload.time);
    if (Number.isFinite(Number(payload.seconds))) return Number(payload.seconds);
    if (payload.detail && Number.isFinite(Number(payload.detail.currentTime))) return Number(payload.detail.currentTime);
    return NaN;
  }

  async function saveWatchHeartbeat(lessonId, seconds) {
    if (state.watchSaveInFlight) return false;
    state.watchSaveInFlight = true;
    try {
      await api("/.netlify/functions/user-learning-progress-save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          lesson_id: lessonId,
          mark_complete: false,
          watch_seconds: Math.max(0, Number(seconds || 0)),
        }),
      });
      return true;
    } catch (_error) {
      return false;
    } finally {
      state.watchSaveInFlight = false;
    }
  }

  function flushWatchHeartbeat(force, useBeacon) {
    var lessonId = Number(state.activeLessonId || 0);
    var rounded = Math.floor(state.pendingWatchSeconds);
    var nowMs = Date.now();
    if (!Number.isFinite(lessonId) || lessonId <= 0 || rounded <= 0) return;
    if (!force && rounded < WATCH_HEARTBEAT_SECONDS) return;
    if (!force && nowMs - Number(state.lastWatchSaveAtMs || 0) < WATCH_HEARTBEAT_MIN_GAP_MS) return;

    state.pendingWatchSeconds = Math.max(0, state.pendingWatchSeconds - rounded);

    if (useBeacon && navigator && typeof navigator.sendBeacon === "function") {
      try {
        var body = JSON.stringify({
          lesson_id: lessonId,
          mark_complete: false,
          watch_seconds: rounded,
        });
        var blob = new Blob([body], { type: "application/json" });
        if (navigator.sendBeacon("/.netlify/functions/user-learning-progress-save", blob)) {
          state.lastWatchSaveAtMs = nowMs;
          return;
        }
      } catch (_error) {}
    }

    saveWatchHeartbeat(lessonId, rounded).then(function (ok) {
      if (ok) {
        state.lastWatchSaveAtMs = Date.now();
        return;
      }
      state.pendingWatchSeconds += rounded;
    });
  }

  function stopWatchTracking(flushFirst, useBeacon) {
    if (flushFirst) flushWatchHeartbeat(true, !!useBeacon);
    state.isPlaying = false;
    state.lastTrackedPlayerSecond = null;
    state.playerApi = null;
    if (state.watchFlushTimer) {
      clearInterval(state.watchFlushTimer);
      state.watchFlushTimer = null;
    }
  }

  function bindWatchTracking(iframe, embedToken) {
    stopWatchTracking(false, false);
    state.watchFlushTimer = setInterval(function () {
      if (!state.isPlaying) return;
      flushWatchHeartbeat(false, false);
    }, WATCH_HEARTBEAT_INTERVAL_MS);

    loadCloudflarePlayerSdk()
      .then(function (Stream) {
        if (embedToken !== state.activeEmbedToken || iframe !== state.iframeEl) return;
        var player = Stream(iframe);
        state.playerApi = player;

        function onPlay() {
          if (embedToken !== state.activeEmbedToken || iframe !== state.iframeEl) return;
          state.isPlaying = true;
        }
        function onPauseLike() {
          if (embedToken !== state.activeEmbedToken || iframe !== state.iframeEl) return;
          state.isPlaying = false;
          flushWatchHeartbeat(false, false);
        }
        function onTimeUpdate(payload) {
          if (embedToken !== state.activeEmbedToken || iframe !== state.iframeEl) return;
          var currentSecond = parsePlayerTimeSeconds(payload);
          if (!Number.isFinite(currentSecond) || currentSecond < 0) return;
          if (!state.isPlaying) {
            state.lastTrackedPlayerSecond = currentSecond;
            return;
          }
          if (!Number.isFinite(state.lastTrackedPlayerSecond)) {
            state.lastTrackedPlayerSecond = currentSecond;
            return;
          }
          var delta = currentSecond - state.lastTrackedPlayerSecond;
          state.lastTrackedPlayerSecond = currentSecond;
          if (!Number.isFinite(delta) || delta <= 0 || delta > 20) return;
          queueWatchSeconds(delta);
          flushWatchHeartbeat(false, false);
        }
        function onEnded() {
          if (embedToken !== state.activeEmbedToken || iframe !== state.iframeEl) return;
          state.isPlaying = false;
          flushWatchHeartbeat(true, false);
        }

        if (player && typeof player.addEventListener === "function") {
          player.addEventListener("play", onPlay);
          player.addEventListener("playing", onPlay);
          player.addEventListener("pause", onPauseLike);
          player.addEventListener("waiting", onPauseLike);
          player.addEventListener("stalled", onPauseLike);
          player.addEventListener("ended", onEnded);
          player.addEventListener("timeupdate", onTimeUpdate);
        }
      })
      .catch(function () {
        setStatus("Player loaded, but progress tracking is temporarily unavailable.", false);
      });
  }

  function calcCourseProgress(modules) {
    var total = 0;
    var completed = 0;
    modules.forEach(function (moduleRow) {
      (moduleRow.lessons || []).forEach(function (lesson) {
        total += 1;
        if (lesson.progress && lesson.progress.is_completed) completed += 1;
      });
    });
    var percent = total ? Math.round((completed / total) * 100) : 0;
    return { total: total, completed: completed, percent: percent };
  }

  function applyCourseProgress(modules) {
    var p = calcCourseProgress(modules || []);
    if (progressBarEl) progressBarEl.style.width = String(p.percent) + "%";
    if (progressTextEl) progressTextEl.textContent = p.completed + " of " + p.total + " lessons completed";
    if (completionBadgeEl) completionBadgeEl.textContent = String(p.percent) + "%";
    if (metaEl) metaEl.textContent = p.total + " lessons available";
  }

  function renderSidebar() {
    if (!sidebarEl) return;
    if (!state.modules.length) {
      sidebarEl.innerHTML = '<p class="text-sm text-gray-500">No modules yet.</p>';
      return;
    }

    var html = state.modules
      .map(function (moduleRow, moduleIndex) {
        var lessonRows = (moduleRow.lessons || [])
          .map(function (lesson, lessonIndex) {
            var active = Number(lesson.id) === Number(state.activeLessonId);
            var done = !!(lesson.progress && lesson.progress.is_completed);
            return [
              '<button type="button" class="player-lesson w-full text-left rounded-xl border px-3 py-2 transition-colors ' +
                (active ? "active border-brand-300" : "border-gray-200 hover:bg-gray-50") +
                '" data-lesson-id="' +
                String(lesson.id) +
                '">',
              '<div class="flex items-start gap-2">',
              '<span class="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ' +
                (done ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600") +
                '">' +
                (done ? "✓" : String(lessonIndex + 1)) +
                '</span>',
              '<span class="min-w-0">',
              '<span class="block text-xs text-gray-500">Lesson ' + String(lesson.order || lessonIndex + 1) + "</span>",
              '<span class="block text-sm font-semibold text-gray-900 truncate">' + escapeHtml(lesson.title) + "</span>",
              "</span>",
              "</div>",
              "</button>",
            ].join("");
          })
          .join("");

        return [
          '<div class="rounded-xl border border-gray-200 p-3">',
          '<p class="text-xs font-bold uppercase tracking-wide text-brand-600">Module ' + String(moduleIndex + 1) + "</p>",
          '<h3 class="text-sm font-heading font-bold text-gray-900 mt-1">' + escapeHtml(moduleRow.title) + "</h3>",
          '<div class="mt-2 space-y-2">' + lessonRows + "</div>",
          "</div>",
        ].join("");
      })
      .join("");

    sidebarEl.innerHTML = html;

    Array.prototype.slice.call(sidebarEl.querySelectorAll("[data-lesson-id]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = Number(btn.getAttribute("data-lesson-id") || 0);
        if (!Number.isFinite(id) || id <= 0) return;
        openLesson(id);
      });
    });
  }

  function clearEmbedFallbackTimer() {
    if (state.embedFallbackTimer) {
      clearTimeout(state.embedFallbackTimer);
      state.embedFallbackTimer = null;
    }
  }

  function clearPlaybackRefreshTimer() {
    if (state.playbackRefreshTimer) {
      clearTimeout(state.playbackRefreshTimer);
      state.playbackRefreshTimer = null;
    }
  }

  function parseDateMs(value) {
    var ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  function getCachedPlayback(lessonId, minValidityMs) {
    var id = Number(lessonId || 0);
    if (!id) return null;
    var cached = state.playbackCache.get(id) || null;
    if (!cached) return null;
    var now = Date.now();
    var minMs = Math.max(0, Number(minValidityMs || 0));
    if (!Number.isFinite(cached.expiresAtMs) || cached.expiresAtMs <= now + minMs) return null;
    return cached;
  }

  function cachePlayback(lessonId, playback) {
    var id = Number(lessonId || 0);
    if (!id || !playback) return null;
    var now = Date.now();
    var ttlSeconds = Number(playback.ttl_seconds || 0);
    var expiresAtMs = parseDateMs(playback.expires_at);
    if (!expiresAtMs && Number.isFinite(ttlSeconds) && ttlSeconds > 0) {
      expiresAtMs = now + (ttlSeconds * 1000);
    }
    var refreshAfterSeconds = Number(playback.refresh_after_seconds || 0);
    var refreshAtMs = now + (Math.max(45, Number.isFinite(refreshAfterSeconds) ? refreshAfterSeconds : 240) * 1000);
    if (expiresAtMs > 0 && refreshAtMs >= expiresAtMs - 15000) {
      refreshAtMs = Math.max(now + 45000, expiresAtMs - 60000);
    }
    var normalized = {
      embedUrl: clean(playback.embed_url),
      expiresAtMs: expiresAtMs,
      refreshAtMs: refreshAtMs,
      ttlSeconds: Number.isFinite(ttlSeconds) ? ttlSeconds : 0,
    };
    state.playbackCache.set(id, normalized);
    return normalized;
  }

  function schedulePlaybackRefresh(lessonId, embedToken) {
    clearPlaybackRefreshTimer();
    var id = Number(lessonId || 0);
    var cached = state.playbackCache.get(id) || null;
    if (!id || !cached || !Number.isFinite(cached.refreshAtMs) || cached.refreshAtMs <= 0) return;
    var delayMs = Math.max(15000, cached.refreshAtMs - Date.now());
    state.playbackRefreshTimer = setTimeout(function () {
      if (id !== Number(state.activeLessonId || 0)) return;
      if (embedToken !== state.activeEmbedToken) return;
      fetchLessonPlayback(id, { force: true, silent: true })
        .then(function () {
          if (id !== Number(state.activeLessonId || 0)) return;
          if (embedToken !== state.activeEmbedToken) return;
          schedulePlaybackRefresh(id, embedToken);
        })
        .catch(function () {
          if (id !== Number(state.activeLessonId || 0)) return;
          if (embedToken !== state.activeEmbedToken) return;
          state.playbackRefreshTimer = setTimeout(function () {
            schedulePlaybackRefresh(id, embedToken);
          }, 45000);
        });
    }, delayMs);
  }

  function detachPlayer() {
    if (!frameHostEl) return;
    clearPlaybackRefreshTimer();
    stopWatermarkTicker();
    stopWatchTracking(false, false);
    if (state.iframeEl) {
      try {
        state.iframeEl.src = "about:blank";
      } catch (_error) {}
      try {
        state.iframeEl.remove();
      } catch (_error) {}
      state.iframeEl = null;
    }
    frameHostEl.innerHTML = "";
  }

  function showIframeMode(src, embedToken) {
    if (!frameHostEl) return false;
    setPlayerSkeleton(true);
    clearEmbedFallbackTimer();
    detachPlayer();
    if (frameHostEl.getBoundingClientRect().height < 120) {
      frameHostEl.style.minHeight = "220px";
    }
    var iframe = document.createElement("iframe");
    iframe.title = "Lesson video";
    iframe.src = src;
    iframe.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    iframe.setAttribute("allowfullscreen", "true");
    iframe.style.border = "none";
    iframe.style.position = "absolute";
    iframe.style.top = "0";
    iframe.style.left = "0";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.background = "#000";

    iframe.addEventListener("load", function () {
      if (embedToken !== state.activeEmbedToken || iframe !== state.iframeEl) return;
      var currentSrc = clean(iframe.getAttribute("src"));
      if (!currentSrc || currentSrc === "about:blank") return;
      var rect = frameHostEl.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 40) {
        setPlayerSkeleton(false);
        state.lastErroredLessonId = Number(state.activeLessonId || 0);
        setStatus("Video player loaded but is not visible. Refresh and retry.", true);
        return;
      }
      state.lastErroredLessonId = 0;
      setPlayerSkeleton(false);
      setStatus("Player ready. Press play to start.", false);
    });

    iframe.addEventListener("error", function () {
      if (embedToken !== state.activeEmbedToken || iframe !== state.iframeEl) return;
      setPlayerSkeleton(false);
      state.lastErroredLessonId = Number(state.activeLessonId || 0);
      setStatus("Could not load embedded video player for this lesson.", true);
    });

    frameHostEl.appendChild(iframe);
    state.iframeEl = iframe;
    bindWatchTracking(iframe, embedToken);
    return true;
  }

  function setVideoSource(embedUrl) {
    var embed = clean(embedUrl);
    var embedToken = state.activeEmbedToken;
    if (embed && showIframeMode(embed, embedToken)) {
      setStatus("Loading player...", false);
      return;
    }

    setPlayerSkeleton(false);
    state.lastErroredLessonId = Number(state.activeLessonId || 0);
    setStatus("This lesson has no playable video URL yet.", true);
  }

  async function fetchLessonPlayback(lessonId, options) {
    var opts = options || {};
    var id = Number(lessonId || 0);
    var cached = !opts.force ? getCachedPlayback(id, 30000) : null;
    if (cached && cached.embedUrl) return cached;
    var payload = await api("/.netlify/functions/user-learning-playback-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ lesson_id: id }),
    });
    var playback = payload && payload.playback ? payload.playback : null;
    var normalized = cachePlayback(id, playback);
    if (!normalized || !normalized.embedUrl) {
      throw new Error("Could not load secure playback URL for this lesson.");
    }
    return normalized;
  }

  function flattenLessons(modules) {
    return (modules || []).reduce(function (list, moduleRow) {
      return list.concat(moduleRow.lessons || []);
    }, []);
  }

  function normalizeText(value) {
    return clean(value, 300).toLowerCase().replace(/\s+/g, " ").trim();
  }

  function dedupeModules(modules) {
    var list = Array.isArray(modules) ? modules : [];
    var out = [];
    var seen = new Set();
    list.forEach(function (mod) {
      var key = [
        normalizeText(state.courseSlug),
        normalizeText(mod && mod.title) || normalizeText(mod && mod.slug),
      ].join("::");
      if (seen.has(key)) return;
      seen.add(key);
      out.push(mod);
    });
    return out;
  }

  function validateCoursePayloadShape(course) {
    if (!course || typeof course !== "object") return "Course payload is missing";
    if (!Array.isArray(course.modules)) return "Course modules payload is invalid";
    for (var i = 0; i < course.modules.length; i += 1) {
      var moduleRow = course.modules[i];
      if (!moduleRow || typeof moduleRow !== "object") return "Course module payload is invalid";
      if (!Array.isArray(moduleRow.lessons)) return "Course lesson payload is invalid";
    }
    return "";
  }

  function sortModulesAndLessons(modules) {
    return (Array.isArray(modules) ? modules : [])
      .slice()
      .sort(function (a, b) {
        var aOrder = Number(a && a.sort_order || 0);
        var bOrder = Number(b && b.sort_order || 0);
        if (aOrder !== bOrder) return aOrder - bOrder;
        return Number(a && a.id || 0) - Number(b && b.id || 0);
      })
      .map(function (moduleRow) {
        var lessons = (Array.isArray(moduleRow.lessons) ? moduleRow.lessons : []).slice().sort(function (a, b) {
          var aOrder = Number(a && a.order || 0);
          var bOrder = Number(b && b.order || 0);
          if (aOrder !== bOrder) return aOrder - bOrder;
          return Number(a && a.id || 0) - Number(b && b.id || 0);
        });
        return Object.assign({}, moduleRow, { lessons: lessons });
      });
  }

  function hasDuplicateModuleRenderKeys(modules) {
    var seen = new Set();
    for (var i = 0; i < modules.length; i += 1) {
      var mod = modules[i];
      var key = [normalizeText(state.courseSlug), normalizeText(mod && mod.title) || normalizeText(mod && mod.slug)].join("::");
      if (seen.has(key)) return true;
      seen.add(key);
    }
    return false;
  }

  function pickDefaultLesson(modules) {
    var lessons = flattenLessons(modules);
    if (!lessons.length) return 0;
    var firstIncomplete = lessons.find(function (lesson) {
      return !(lesson.progress && lesson.progress.is_completed);
    });
    return Number((firstIncomplete || lessons[0]).id || 0);
  }

  function syncLessonOrder() {
    state.lessonOrder = flattenLessons(state.modules).map(function (lesson) {
      return Number(lesson.id || 0);
    }).filter(function (id) {
      return Number.isFinite(id) && id > 0;
    });
    state.activeLessonIndex = state.lessonOrder.indexOf(Number(state.activeLessonId || 0));
  }

  function updateLessonNavButtons() {
    if (!prevLessonBtn || !nextLessonBtn) return;
    var idx = Number(state.activeLessonIndex || -1);
    var hasPrev = idx > 0;
    var hasNext = idx >= 0 && idx < state.lessonOrder.length - 1;
    prevLessonBtn.disabled = !hasPrev;
    nextLessonBtn.disabled = !hasNext;
  }

  function openLesson(lessonId) {
    var lesson = state.lessonById.get(Number(lessonId));
    if (!lesson) return;
    stopWatchTracking(true, false);
    state.currentLesson = lesson;
    state.activeLessonId = Number(lesson.id);
    state.activeEmbedToken += 1;
    syncLessonOrder();
    renderSidebar();

    if (paneEl) paneEl.hidden = false;
    if (emptyEl) emptyEl.hidden = true;

    if (lessonTitleEl) lessonTitleEl.textContent = lesson.title || "Lesson";
    var doneText = lesson.progress && lesson.progress.is_completed ? "Completed" : "Not completed";
    var lastText = lesson.progress && lesson.progress.last_watched_at ? "Last watched: " + fmtDate(lesson.progress.last_watched_at) : "";
    if (lessonMetaEl) lessonMetaEl.textContent = [doneText, lastText].filter(Boolean).join(" • ");
    if (lessonNotesEl) {
      var notes = clean(lesson.notes || "");
      lessonNotesEl.textContent = notes ? "Notes: " + notes : "";
      lessonNotesEl.hidden = !notes;
    }
    renderLessonAccessibility(lesson);
    applyAssignmentContextForLesson(lesson);
    applyCommunityContextForLesson(lesson);
    announceLesson(lesson);
    if (lessonTitleEl && typeof lessonTitleEl.focus === "function") {
      try {
        lessonTitleEl.focus({ preventScroll: true });
      } catch (_error) {
        lessonTitleEl.focus();
      }
    }

    if (markBtn) {
      markBtn.disabled = !!(lesson.progress && lesson.progress.is_completed);
      markBtn.textContent = markBtn.disabled ? "Lesson completed" : "Mark lesson complete";
      markBtn.setAttribute("data-lesson-id", String(lesson.id));
    }

    setStatus("Authorizing lesson access...", false);
    updateLessonNavButtons();
    clearPlaybackRefreshTimer();
    if (!lesson.video || lesson.video.has_video !== true) {
      setVideoSource("");
      return;
    }
    var activeEmbedToken = state.activeEmbedToken;
    fetchLessonPlayback(lesson.id, { force: false })
      .then(function (playback) {
        if (activeEmbedToken !== state.activeEmbedToken) return;
        if (!playback || !playback.embedUrl) throw new Error("Could not load secure playback URL for this lesson.");
        setVideoSource(playback.embedUrl);
        schedulePlaybackRefresh(lesson.id, activeEmbedToken);
      })
      .catch(function (error) {
        if (activeEmbedToken !== state.activeEmbedToken) return;
        setPlayerSkeleton(false);
        setStatus(error && error.message ? error.message : "Could not authorize this lesson video.", true);
      });
  }

  async function api(url, init) {
    var response = await fetch(url, Object.assign({ credentials: "include", headers: { Accept: "application/json" } }, init || {}));
    var data = await response.json().catch(function () {
      return null;
    });
    if (!response.ok || !data || data.ok !== true) {
      throw new Error((data && data.error) || "Request failed");
    }
    return data;
  }

  function setAssignmentMessage(text, bad) {
    if (!assignmentMessageEl) return;
    assignmentMessageEl.textContent = clean(text);
    assignmentMessageEl.className = "text-xs " + (bad ? "text-red-600" : "text-gray-500");
  }

  function assignmentEnabled() {
    return !!(state.features && state.features.assignments_enabled);
  }

  function communityEnabled() {
    return !!(state.features && state.features.course_community_enabled);
  }

  function tutorQuestionsEnabled() {
    return !!(state.features && state.features.tutor_questions_enabled);
  }

  function renderAssignmentRows() {
    if (!assignmentRowsEl) return;
    var items = Array.isArray(state.assignmentItems) ? state.assignmentItems : [];
    if (!items.length) {
      assignmentRowsEl.innerHTML = '<tr><td colspan="4" class="px-3 py-3 text-xs text-gray-500">No submissions yet.</td></tr>';
      return;
    }
    assignmentRowsEl.innerHTML = items.map(function (item) {
      return [
        "<tr>",
        '<td class="px-3 py-2 text-xs text-gray-600">' + escapeHtml(fmtDate(item.created_at)) + "</td>",
        '<td class="px-3 py-2 text-xs text-gray-700">' + escapeHtml(clean(item.submission_kind, 24)) + "</td>",
        '<td class="px-3 py-2 text-xs"><span class="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-700">' + escapeHtml(clean(item.status, 32) || "submitted") + "</span></td>",
        '<td class="px-3 py-2 text-xs text-gray-600">' + escapeHtml(clean(item.admin_feedback, 300) || "-") + "</td>",
        "</tr>",
      ].join("");
    }).join("");
  }

  function renderAssignmentScreenshotPreview() {
    if (!assignmentScreenshotPreviewEl) return;
    var items = Array.isArray(state.assignmentScreenshotUploads) ? state.assignmentScreenshotUploads : [];
    if (!items.length) {
      assignmentScreenshotPreviewEl.innerHTML = "";
      return;
    }
    assignmentScreenshotPreviewEl.innerHTML = items.map(function (item) {
      var url = clean(item && item.url, 1500);
      return [
        '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer" class="block rounded-lg border border-gray-200 p-1">',
        '<img src="' + escapeHtml(url) + '" alt="Screenshot" class="h-20 w-full rounded-md object-cover bg-gray-100" />',
        "</a>",
      ].join("");
    }).join("");
  }

  function setCommunityMessage(text, bad) {
    if (!communityMessageEl) return;
    communityMessageEl.textContent = clean(text);
    communityMessageEl.className = "text-xs " + (bad ? "text-red-600" : "text-gray-500");
  }

  function closeConfirmModal(result) {
    if (!confirmModalEl) return;
    confirmModalEl.classList.add("hidden");
    confirmModalEl.setAttribute("aria-hidden", "true");
    var resolver = state.confirmResolver;
    state.confirmResolver = null;
    if (typeof resolver === "function") resolver(!!result);
  }

  function openConfirmModal(config) {
    if (!confirmModalEl) return Promise.resolve(false);
    var data = config && typeof config === "object" ? config : {};
    if (confirmModalTitleEl) confirmModalTitleEl.textContent = clean(data.title || "Confirm action");
    if (confirmModalBodyEl) confirmModalBodyEl.textContent = clean(data.body || "This action cannot be undone.");
    if (confirmModalConfirmEl) {
      confirmModalConfirmEl.textContent = clean(data.confirmLabel || "Confirm");
      confirmModalConfirmEl.className = "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-white " + (data && data.danger ? "bg-red-600 hover:bg-red-500" : "bg-brand-600 hover:bg-brand-500");
    }
    confirmModalEl.classList.remove("hidden");
    confirmModalEl.setAttribute("aria-hidden", "false");
    return new Promise(function (resolve) {
      state.confirmResolver = resolve;
    });
  }

  function closeEditModal(result) {
    if (!editModalEl) return;
    editModalEl.classList.add("hidden");
    editModalEl.setAttribute("aria-hidden", "true");
    var resolver = state.editResolver;
    state.editResolver = null;
    if (typeof resolver === "function") {
      if (!result) resolver(null);
      else {
        resolver({
          title: clean(editModalTitleInputEl && editModalTitleInputEl.value),
          body: clean(editModalBodyInputEl && editModalBodyInputEl.value),
        });
      }
    }
  }

  function openEditModal(config) {
    if (!editModalEl) return Promise.resolve(null);
    var data = config && typeof config === "object" ? config : {};
    var needsTitle = !!data.needsTitle;
    if (editModalTitleEl) editModalTitleEl.textContent = clean(data.modalTitle || "Edit");
    if (editModalTitleWrapEl) editModalTitleWrapEl.classList.toggle("hidden", !needsTitle);
    if (editModalTitleInputEl) editModalTitleInputEl.value = clean(data.title || "");
    if (editModalBodyInputEl) editModalBodyInputEl.value = clean(data.body || "");
    if (editModalSaveEl) editModalSaveEl.textContent = clean(data.saveLabel || "Save Changes");
    editModalEl.classList.remove("hidden");
    editModalEl.setAttribute("aria-hidden", "false");
    setTimeout(function () {
      if (needsTitle && editModalTitleInputEl && typeof editModalTitleInputEl.focus === "function") editModalTitleInputEl.focus();
      else if (editModalBodyInputEl && typeof editModalBodyInputEl.focus === "function") editModalBodyInputEl.focus();
    }, 0);
    return new Promise(function (resolve) {
      state.editResolver = resolve;
    });
  }

  function applyCommunityContextForLesson(lesson) {
    if (!communityLessonContextEl) return;
    var text = lesson && lesson.title ? lesson.title : "General course thread";
    communityLessonContextEl.value = text;
  }

  function syncCommunityTypeOptions() {
    if (!communityTypeSelectEl) return;
    var allowTutor = tutorQuestionsEnabled();
    var tutorOption = communityTypeSelectEl.querySelector('option[value="tutor"]');
    if (tutorOption) {
      tutorOption.hidden = !allowTutor;
      tutorOption.disabled = !allowTutor;
      tutorOption.style.display = allowTutor ? "" : "none";
    }
    if (!allowTutor && clean(communityTypeSelectEl.value).toLowerCase() === "tutor") {
      communityTypeSelectEl.value = "peer";
    }
  }

  function sameEmail(a, b) {
    return clean(a).toLowerCase() === clean(b).toLowerCase();
  }

  function isOwnedByCurrentAccount(item) {
    var accountId = Number(state.account && state.account.id || 0);
    var ownerId = Number(item && item.account_id || 0);
    if (accountId > 0 && ownerId > 0) return accountId === ownerId;
    return sameEmail(state.account && state.account.email, item && (item.author_email || item.student_email));
  }

  function filteredCommunityThreads() {
    var items = Array.isArray(state.communityThreads) ? state.communityThreads : [];
    var q = clean(state.communitySearchTerm, 220).toLowerCase();
    if (!q) return items;
    return items.filter(function (row) {
      var hay = [row && row.title, row && row.body, row && row.author_name, row && row.author_email, row && row.question_type].join(" ").toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  function renderCommunityThreads() {
    if (!communityThreadListEl) return;
    var items = filteredCommunityThreads();
    if (!items.length) {
      communityThreadListEl.innerHTML = '<div class="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-xs text-gray-500">No threads yet. Ask the first question for this course.</div>';
      return;
    }
    communityThreadListEl.innerHTML = items.map(function (item) {
      var id = Number(item && item.id || 0);
      var type = clean(item && item.question_type, 24).toLowerCase() || "peer";
      var owned = isOwnedByCurrentAccount(item);
      var typeChip = type === "tutor"
        ? '<span class="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Tutor Question</span>'
        : '<span class="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">Peer Question</span>';
      var replies = state.communityRepliesByThread && state.communityRepliesByThread.get(id)
        ? state.communityRepliesByThread.get(id)
        : [];
      var replyItems = (Array.isArray(replies) ? replies : []).map(function (reply, idx) {
        var replyId = Number(reply && reply.id || 0);
        var replyOwned = isOwnedByCurrentAccount(reply);
        var tint = ["bg-blue-50 border-blue-100", "bg-emerald-50 border-emerald-100", "bg-amber-50 border-amber-100", "bg-slate-50 border-slate-200"][idx % 4];
        return [
          '<div class="rounded-lg border ' + tint + ' px-3 py-2">',
          '<p class="text-xs font-semibold text-gray-800">' + escapeHtml(clean(reply.author_name) || clean(reply.author_email) || "Student") + '</p>',
          '<p class="mt-1 text-xs text-gray-700 whitespace-pre-wrap">' + escapeHtml(clean(reply.body, 20000)) + "</p>",
          '<div class="mt-1 flex flex-wrap items-center justify-between gap-2">',
          '<p class="text-[11px] text-gray-500">' + escapeHtml(fmtDate(reply.created_at)) + "</p>",
          (replyOwned
            ? '<div class="flex items-center gap-1"><button type="button" data-community-reply-edit="' + String(replyId) + '" data-community-thread-id="' + String(id) + '" class="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50">Edit</button><button type="button" data-community-reply-delete="' + String(replyId) + '" data-community-thread-id="' + String(id) + '" class="inline-flex items-center justify-center rounded-md border border-red-200 bg-white px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50">Delete</button></div>'
            : ""),
          "</div>",
          "</div>",
        ].join("");
      }).join("");
      return [
        '<article class="rounded-lg border border-gray-200 bg-white p-3">',
        '<div class="flex flex-wrap items-center justify-between gap-2">',
        typeChip,
        '<span class="text-[11px] text-gray-500">' + escapeHtml(fmtDate(item.created_at)) + "</span>",
        "</div>",
        '<h4 class="mt-2 text-sm font-semibold text-gray-900">' + escapeHtml(clean(item.title, 220)) + "</h4>",
        '<p class="mt-1 text-xs text-gray-700 whitespace-pre-wrap">' + escapeHtml(clean(item.body, 20000)) + "</p>",
        '<p class="mt-2 text-[11px] text-gray-500">Posted by ' + escapeHtml(clean(item.author_name) || clean(item.author_email) || "Student") + " • " + escapeHtml(String(Number(item.replies_count || 0))) + " repl" + (Number(item.replies_count || 0) === 1 ? "y" : "ies") + "</p>",
        '<div class="mt-2 flex flex-wrap items-center gap-2">',
        '<button type="button" data-community-load-replies="' + String(id) + '" class="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">View Replies</button>',
        (owned
          ? '<button type="button" data-community-thread-edit="' + String(id) + '" class="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">Edit Post</button><button type="button" data-community-thread-delete="' + String(id) + '" class="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">Delete Post</button>'
          : ""),
        "</div>",
        '<div class="mt-2 space-y-2" data-community-replies-wrap="' + String(id) + '">' + (replyItems || "") + "</div>",
        '<div class="mt-2 flex flex-col gap-2 sm:flex-row">',
        '<textarea rows="2" data-community-reply-input="' + String(id) + '" placeholder="Write a reply..." class="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-brand-500 focus:ring-brand-500"></textarea>',
        '<button type="button" data-community-reply-submit="' + String(id) + '" class="inline-flex items-center justify-center rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-500">Reply</button>',
        "</div>",
        "</article>",
      ].join("");
    }).join("");
  }

  function syncAssignmentUIForType() {
    var kind = clean(assignmentTypeSelectEl && assignmentTypeSelectEl.value, 24).toLowerCase() || "text";
    if (assignmentTextInputEl) {
      assignmentTextInputEl.classList.toggle("hidden", kind !== "text");
    }
    if (assignmentLinkInputEl) {
      assignmentLinkInputEl.classList.toggle("hidden", kind !== "link");
    }
    if (assignmentScreenshotWrapEl) {
      assignmentScreenshotWrapEl.classList.toggle("hidden", kind !== "screenshots");
    }
  }

  async function fetchAssignmentUploadSignature() {
    var payload = await api("/.netlify/functions/user-learning-assignment-upload-signature", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        course_slug: state.courseSlug,
      }),
    });
    return payload;
  }

  async function uploadAssignmentImage(file) {
    var uploadConfig = await fetchAssignmentUploadSignature();
    var fd = new FormData();
    fd.append("file", file);
    fd.append("api_key", uploadConfig.apiKey);
    fd.append("timestamp", String(uploadConfig.timestamp));
    fd.append("folder", uploadConfig.folder);
    fd.append("signature", uploadConfig.signature);
    var endpoint = "https://api.cloudinary.com/v1_1/" + encodeURIComponent(uploadConfig.cloudName) + "/auto/upload";
    var res = await fetch(endpoint, { method: "POST", body: fd });
    var json = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !json || !json.secure_url) {
      throw new Error((json && json.error && json.error.message) || "Could not upload screenshot");
    }
    return {
      url: clean(json.secure_url, 1500),
      public_id: clean(json.public_id, 240),
    };
  }

  async function loadAssignments() {
    if (!assignmentEnabled()) {
      state.assignmentItems = [];
      renderAssignmentRows();
      return;
    }
    var payload = await api("/.netlify/functions/user-learning-assignments-list?course_slug=" + encodeURIComponent(state.courseSlug));
    state.assignmentItems = Array.isArray(payload.items) ? payload.items : [];
    renderAssignmentRows();
  }

  async function loadCommunityThreads() {
    if (!communityEnabled()) {
      state.communityThreads = [];
      state.communityRepliesByThread = new Map();
      renderCommunityThreads();
      return;
    }
    var payload = await api("/.netlify/functions/user-learning-community-threads-list?course_slug=" + encodeURIComponent(state.courseSlug));
    state.communityThreads = Array.isArray(payload.items) ? payload.items : [];
    renderCommunityThreads();
  }

  async function loadCommunityReplies(threadId) {
    var id = Number(threadId || 0);
    if (!(id > 0)) return;
    if (!communityEnabled()) return;
    var payload = await api(
      "/.netlify/functions/user-learning-community-replies-list?course_slug=" +
      encodeURIComponent(state.courseSlug) +
      "&thread_id=" + encodeURIComponent(String(id))
    );
    var items = Array.isArray(payload.items) ? payload.items : [];
    state.communityRepliesByThread.set(id, items);
    renderCommunityThreads();
  }

  function resetCommunityComposer() {
    if (communityTitleInputEl) communityTitleInputEl.value = "";
    if (communityBodyInputEl) communityBodyInputEl.value = "";
    if (communityTypeSelectEl && clean(communityTypeSelectEl.value).toLowerCase() !== "peer" && !tutorQuestionsEnabled()) {
      communityTypeSelectEl.value = "peer";
    }
  }

  async function submitCommunityThread() {
    if (!communityEnabled()) throw new Error("Course community is disabled for this course.");
    var lessonId = Number(state.activeLessonId || 0);
    var selectedType = clean(communityTypeSelectEl && communityTypeSelectEl.value).toLowerCase() || "peer";
    if (!tutorQuestionsEnabled() && selectedType === "tutor") selectedType = "peer";
    var body = {
      course_slug: state.courseSlug,
      question_type: selectedType,
      lesson_id: Number.isFinite(lessonId) && lessonId > 0 ? lessonId : null,
      title: clean(communityTitleInputEl && communityTitleInputEl.value),
      body: clean(communityBodyInputEl && communityBodyInputEl.value),
    };
    var payload = await api("/.netlify/functions/user-learning-community-thread-create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (payload && payload.item) {
      state.communityThreads = [payload.item].concat(state.communityThreads || []);
    }
    resetCommunityComposer();
    renderCommunityThreads();
  }

  async function submitCommunityReply(threadId, text) {
    var id = Number(threadId || 0);
    if (!(id > 0)) throw new Error("Invalid thread selected.");
    if (!communityEnabled()) throw new Error("Course community is disabled for this course.");
    var payload = await api("/.netlify/functions/user-learning-community-reply-create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        course_slug: state.courseSlug,
        thread_id: id,
        body: clean(text),
      }),
    });
    var item = payload && payload.item ? payload.item : null;
    if (!item) return;

    var replies = state.communityRepliesByThread.get(id);
    if (!Array.isArray(replies)) replies = [];
    replies = replies.concat([item]);
    state.communityRepliesByThread.set(id, replies);
    state.communityThreads = (state.communityThreads || []).map(function (thread) {
      if (Number(thread && thread.id || 0) !== id) return thread;
      var count = Number(thread && thread.replies_count || 0) + 1;
      return Object.assign({}, thread, {
        replies_count: count,
        last_activity_at: item.created_at || thread.last_activity_at,
      });
    });
    renderCommunityThreads();
  }

  async function updateCommunityThread(threadId, title, text) {
    var id = Number(threadId || 0);
    if (!(id > 0)) throw new Error("Invalid thread selected.");
    var payload = await api("/.netlify/functions/user-learning-community-thread-update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        course_slug: state.courseSlug,
        thread_id: id,
        title: clean(title),
        body: clean(text),
      }),
    });
    var item = payload && payload.item ? payload.item : null;
    if (!item) return;
    state.communityThreads = (state.communityThreads || []).map(function (row) {
      return Number(row && row.id || 0) === id ? item : row;
    });
    renderCommunityThreads();
  }

  async function deleteCommunityThread(threadId) {
    var id = Number(threadId || 0);
    if (!(id > 0)) throw new Error("Invalid thread selected.");
    await api("/.netlify/functions/user-learning-community-thread-delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        course_slug: state.courseSlug,
        thread_id: id,
      }),
    });
    state.communityRepliesByThread.delete(id);
    state.communityThreads = (state.communityThreads || []).filter(function (row) {
      return Number(row && row.id || 0) !== id;
    });
    renderCommunityThreads();
  }

  async function updateCommunityReply(replyId, text) {
    var id = Number(replyId || 0);
    if (!(id > 0)) throw new Error("Invalid reply selected.");
    var payload = await api("/.netlify/functions/user-learning-community-reply-update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        course_slug: state.courseSlug,
        reply_id: id,
        body: clean(text),
      }),
    });
    var item = payload && payload.item ? payload.item : null;
    if (!item) return;
    var threadId = Number(item.thread_id || 0);
    var replies = state.communityRepliesByThread.get(threadId);
    if (!Array.isArray(replies)) replies = [];
    state.communityRepliesByThread.set(threadId, replies.map(function (row) {
      return Number(row && row.id || 0) === id ? item : row;
    }));
    renderCommunityThreads();
  }

  async function deleteCommunityReply(replyId, threadId) {
    var id = Number(replyId || 0);
    var ownerThreadId = Number(threadId || 0);
    if (!(id > 0)) throw new Error("Invalid reply selected.");
    await api("/.netlify/functions/user-learning-community-reply-delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        course_slug: state.courseSlug,
        reply_id: id,
      }),
    });
    var replies = state.communityRepliesByThread.get(ownerThreadId);
    if (!Array.isArray(replies)) replies = [];
    replies = replies.filter(function (row) {
      return Number(row && row.id || 0) !== id;
    });
    state.communityRepliesByThread.set(ownerThreadId, replies);
    state.communityThreads = (state.communityThreads || []).map(function (thread) {
      if (Number(thread && thread.id || 0) !== ownerThreadId) return thread;
      return Object.assign({}, thread, {
        replies_count: Math.max(Number(thread && thread.replies_count || 0) - 1, 0),
      });
    });
    renderCommunityThreads();
  }

  function resetAssignmentComposer() {
    if (assignmentTextInputEl) assignmentTextInputEl.value = "";
    if (assignmentLinkInputEl) assignmentLinkInputEl.value = "";
    if (assignmentScreenshotInputEl) assignmentScreenshotInputEl.value = "";
    state.assignmentScreenshotUploads = [];
    renderAssignmentScreenshotPreview();
  }

  function applyAssignmentContextForLesson(lesson) {
    if (!assignmentLessonContextEl) return;
    var text = lesson && lesson.title ? lesson.title : "General course submission";
    assignmentLessonContextEl.value = text;
  }

  async function submitAssignment() {
    if (!assignmentEnabled()) throw new Error("Assignment submission is disabled for this course.");
    var lessonId = Number(state.activeLessonId || 0);
    var kind = clean(assignmentTypeSelectEl && assignmentTypeSelectEl.value, 24).toLowerCase() || "text";
    var body = {
      course_slug: state.courseSlug,
      lesson_id: Number.isFinite(lessonId) && lessonId > 0 ? lessonId : null,
      submission_kind: kind,
    };
    if (kind === "text") {
      body.submission_text = clean(assignmentTextInputEl && assignmentTextInputEl.value, 20000);
    } else if (kind === "link") {
      body.submission_link = clean(assignmentLinkInputEl && assignmentLinkInputEl.value, 1500);
    } else if (kind === "screenshots") {
      body.screenshot_urls = (state.assignmentScreenshotUploads || []).map(function (row) {
        return clean(row && row.url, 1500);
      }).filter(Boolean);
    }
    var payload = await api("/.netlify/functions/user-learning-assignment-submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (payload && payload.item) {
      state.assignmentItems = [payload.item].concat(state.assignmentItems || []);
      renderAssignmentRows();
    }
    resetAssignmentComposer();
  }

  async function refreshCourse(openLessonId) {
    setCourseMetaText("Loading lessons...");
    var payload = await api("/.netlify/functions/user-learning-course?course_slug=" + encodeURIComponent(state.courseSlug));
    var course = payload && payload.course ? payload.course : null;
    var account = payload && payload.account ? payload.account : null;
    var features = payload && payload.features && typeof payload.features === "object" ? payload.features : null;
    state.account = account && typeof account === "object" ? account : null;
    state.features = features;
    startWatermarkTicker();
    var payloadError = validateCoursePayloadShape(course);
    if (payloadError) throw new Error(payloadError);
    var transcriptAccess = course && course.transcript_access && typeof course.transcript_access === "object"
      ? course.transcript_access
      : {};
    state.transcriptAccessAllowed = !!transcriptAccess.allowed;
    state.transcriptAccessStatus = clean(transcriptAccess.status || "none").toLowerCase() || "none";

    var orderedModules = sortModulesAndLessons(course.modules);
    state.modules = dedupeModules(orderedModules);
    if (hasDuplicateModuleRenderKeys(orderedModules)) {
      setStatus("Some duplicate modules were merged for display.", false);
    }
    state.lessonById = new Map();
    flattenLessons(state.modules).forEach(function (lesson) {
      state.lessonById.set(Number(lesson.id), lesson);
    });

    applyCourseProgress(state.modules);
    if (assignmentCardEl) {
      var enabled = assignmentEnabled();
      assignmentCardEl.hidden = !enabled;
      if (assignmentStatusChipEl) {
        assignmentStatusChipEl.textContent = enabled ? "Enabled" : "Disabled";
        assignmentStatusChipEl.className = "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold " + (enabled ? "bg-brand-50 text-brand-700" : "bg-gray-100 text-gray-600");
      }
    }
    if (assignmentSubmitBtnEl) assignmentSubmitBtnEl.disabled = !assignmentEnabled();
    if (assignmentRefreshBtnEl) assignmentRefreshBtnEl.disabled = !assignmentEnabled();
    setAssignmentMessage("", false);
    await loadAssignments().catch(function () {
      state.assignmentItems = [];
      renderAssignmentRows();
    });
    syncCommunityTypeOptions();
    if (communityCardEl) {
      var communityIsEnabled = communityEnabled();
      communityCardEl.hidden = !communityIsEnabled;
      if (communityStatusChipEl) {
        communityStatusChipEl.textContent = communityIsEnabled ? "Enabled" : "Disabled";
        communityStatusChipEl.className = "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold " + (communityIsEnabled ? "bg-brand-50 text-brand-700" : "bg-gray-100 text-gray-600");
      }
    }
    if (communityPostBtnEl) communityPostBtnEl.disabled = !communityEnabled();
    if (communityRefreshBtnEl) communityRefreshBtnEl.disabled = !communityEnabled();
    setCommunityMessage("", false);
    await loadCommunityThreads().catch(function () {
      state.communityThreads = [];
      state.communityRepliesByThread = new Map();
      renderCommunityThreads();
    });

    if (titleEl) {
      var nice = state.courseSlug.split("-").map(function (part) {
        return part ? part.charAt(0).toUpperCase() + part.slice(1) : "";
      }).join(" ");
      titleEl.textContent = nice + " Player";
    }

    if (!state.lessonById.size) {
      setCourseMetaText("No lessons available right now");
      stopWatchTracking(true, false);
      detachPlayer();
      if (paneEl) paneEl.hidden = true;
      showEmptyState({
        variant: "info",
        chip: "Course update",
        title: "Lessons are not available yet",
        body: "No lesson is currently available for this course. Content may still be scheduled for your batch or awaiting publication.",
        hint: "Please check back later or refresh this page.",
      });
      setPlayerSkeleton(false);
      state.lessonOrder = [];
      state.activeLessonIndex = -1;
      updateLessonNavButtons();
      renderSidebar();
      setStatus("No lessons are available for your account right now.", false);
      return;
    }

    var targetLessonId = Number(openLessonId || state.initialLessonId || state.activeLessonId || 0);
    if (!targetLessonId || !state.lessonById.has(targetLessonId)) {
      targetLessonId = pickDefaultLesson(state.modules);
    }
    state.initialLessonId = 0;

    renderSidebar();
    openLesson(targetLessonId);
  }

  async function markComplete(lessonId) {
    await api("/.netlify/functions/user-learning-progress-save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        lesson_id: lessonId,
        mark_complete: true,
      }),
    });
  }

  async function init() {
    state.courseSlug = queryCourseSlug();
    state.initialLessonId = queryLessonId();
    syncAssignmentUIForType();
    renderAssignmentRows();
    syncCommunityTypeOptions();
    renderCommunityThreads();
    if (!state.courseSlug) {
      setCourseMetaText("Course link issue");
      setStatus("Missing course slug. Open this page from My Courses.", true);
      showEmptyState({
        variant: "error",
        chip: "Invalid link",
        title: "This player link is incomplete",
        body: "Open the course player directly from your My Courses page so we can load the right course.",
        hint: "Use the Back to My Courses button below.",
      });
      return;
    }

    try {
      await refreshCourse();
    } catch (error) {
      var initError = clean(error && error.message);
      if (isFutureAccessMessage(initError)) {
        showFutureAccessState(initError);
      } else {
        setCourseMetaText("Course unavailable");
        setStatus(initError || "Could not load course player.", true);
        showEmptyState({
          variant: "error",
          chip: "Load issue",
          title: "We could not load this course right now",
          body: clean(initError || "Could not load course lessons."),
          hint: "Refresh this page. If it continues, sign out and back in.",
        });
        if (paneEl) paneEl.hidden = true;
      }
    }
  }

  if (markBtn) {
    markBtn.addEventListener("click", function () {
      var lessonId = Number(markBtn.getAttribute("data-lesson-id") || 0);
      if (!Number.isFinite(lessonId) || lessonId <= 0) return;
      markBtn.disabled = true;
      markBtn.textContent = "Saving...";
      markComplete(lessonId)
        .then(function () {
          return refreshCourse(lessonId);
        })
        .then(function () {
          setStatus("Lesson marked complete.", false);
        })
        .catch(function (error) {
          setStatus(error.message || "Could not save completion.", true);
        })
        .finally(function () {
          var lesson = state.lessonById.get(lessonId);
          var isDone = !!(lesson && lesson.progress && lesson.progress.is_completed);
          markBtn.disabled = isDone;
          markBtn.textContent = isDone ? "Lesson completed" : "Mark lesson complete";
        });
    });
  }

  if (retryBtn) {
    retryBtn.addEventListener("click", function () {
      var lessonId = Number(state.activeLessonId || 0);
      if (!Number.isFinite(lessonId) || lessonId <= 0) return;
      openLesson(lessonId);
    });
  }

  if (emptyRefreshBtn) {
    emptyRefreshBtn.addEventListener("click", function () {
      if (emptyRefreshBtn.disabled) return;
      emptyRefreshBtn.disabled = true;
      emptyRefreshBtn.textContent = "Refreshing...";
      refreshCourse(state.activeLessonId)
        .catch(function (error) {
          var refreshError = clean(error && error.message);
          if (isFutureAccessMessage(refreshError)) {
            showFutureAccessState(refreshError);
          } else {
            setCourseMetaText("Refresh failed");
            setStatus(refreshError || "Could not refresh course.", true);
            showEmptyState({
              variant: "error",
              chip: "Load issue",
              title: "Refresh failed",
              body: clean(refreshError || "Could not refresh this course."),
              hint: "Try again in a moment or return to My Courses.",
            });
          }
        })
        .finally(function () {
          emptyRefreshBtn.disabled = false;
          emptyRefreshBtn.textContent = "Refresh";
        });
    });
  }

  if (prevLessonBtn) {
    prevLessonBtn.addEventListener("click", function () {
      var idx = Number(state.activeLessonIndex || -1);
      if (idx <= 0) return;
      var lessonId = Number(state.lessonOrder[idx - 1] || 0);
      if (!lessonId) return;
      openLesson(lessonId);
    });
  }

  if (nextLessonBtn) {
    nextLessonBtn.addEventListener("click", function () {
      var idx = Number(state.activeLessonIndex || -1);
      if (idx < 0 || idx >= state.lessonOrder.length - 1) return;
      var lessonId = Number(state.lessonOrder[idx + 1] || 0);
      if (!lessonId) return;
      openLesson(lessonId);
    });
  }

  if (assignmentTypeSelectEl) {
    assignmentTypeSelectEl.addEventListener("change", function () {
      syncAssignmentUIForType();
    });
  }

  if (assignmentScreenshotInputEl) {
    assignmentScreenshotInputEl.addEventListener("change", function () {
      var files = Array.prototype.slice.call(assignmentScreenshotInputEl.files || []).slice(0, 5);
      if (!files.length) {
        state.assignmentScreenshotUploads = [];
        renderAssignmentScreenshotPreview();
        return;
      }
      setAssignmentMessage("Uploading screenshots...", false);
      Promise.all(files.map(function (file) {
        return uploadAssignmentImage(file);
      }))
        .then(function (uploads) {
          state.assignmentScreenshotUploads = uploads;
          renderAssignmentScreenshotPreview();
          setAssignmentMessage("Screenshot upload complete.", false);
        })
        .catch(function (error) {
          state.assignmentScreenshotUploads = [];
          renderAssignmentScreenshotPreview();
          setAssignmentMessage(error && error.message ? error.message : "Could not upload screenshots.", true);
        });
    });
  }

  if (assignmentSubmitBtnEl) {
    assignmentSubmitBtnEl.addEventListener("click", function () {
      if (assignmentSubmitBtnEl.disabled) return;
      assignmentSubmitBtnEl.disabled = true;
      assignmentSubmitBtnEl.textContent = "Submitting...";
      setAssignmentMessage("", false);
      submitAssignment()
        .then(function () {
          setAssignmentMessage("Assignment submitted successfully.", false);
        })
        .catch(function (error) {
          setAssignmentMessage(error && error.message ? error.message : "Could not submit assignment.", true);
        })
        .finally(function () {
          assignmentSubmitBtnEl.disabled = !assignmentEnabled();
          assignmentSubmitBtnEl.textContent = "Submit Assignment";
        });
    });
  }

  if (assignmentRefreshBtnEl) {
    assignmentRefreshBtnEl.addEventListener("click", function () {
      if (assignmentRefreshBtnEl.disabled) return;
      assignmentRefreshBtnEl.disabled = true;
      assignmentRefreshBtnEl.textContent = "Refreshing...";
      loadAssignments()
        .then(function () {
          setAssignmentMessage("Assignment list refreshed.", false);
        })
        .catch(function (error) {
          setAssignmentMessage(error && error.message ? error.message : "Could not load assignments.", true);
        })
        .finally(function () {
          assignmentRefreshBtnEl.disabled = !assignmentEnabled();
          assignmentRefreshBtnEl.textContent = "Refresh Submissions";
        });
    });
  }

  if (communitySearchInputEl) {
    communitySearchInputEl.addEventListener("input", function () {
      state.communitySearchTerm = clean(communitySearchInputEl.value, 220).toLowerCase();
      renderCommunityThreads();
    });
  }

  if (communityPostBtnEl) {
    communityPostBtnEl.addEventListener("click", function () {
      if (communityPostBtnEl.disabled) return;
      communityPostBtnEl.disabled = true;
      communityPostBtnEl.textContent = "Posting...";
      setCommunityMessage("", false);
      submitCommunityThread()
        .then(function () {
          setCommunityMessage("Question posted to course community.", false);
        })
        .catch(function (error) {
          setCommunityMessage(error && error.message ? error.message : "Could not post question.", true);
        })
        .finally(function () {
          communityPostBtnEl.disabled = !communityEnabled();
          communityPostBtnEl.textContent = "Post Question";
        });
    });
  }

  if (communityRefreshBtnEl) {
    communityRefreshBtnEl.addEventListener("click", function () {
      if (communityRefreshBtnEl.disabled) return;
      communityRefreshBtnEl.disabled = true;
      communityRefreshBtnEl.textContent = "Refreshing...";
      loadCommunityThreads()
        .then(function () {
          setCommunityMessage("Community threads refreshed.", false);
        })
        .catch(function (error) {
          setCommunityMessage(error && error.message ? error.message : "Could not load community threads.", true);
        })
        .finally(function () {
          communityRefreshBtnEl.disabled = !communityEnabled();
          communityRefreshBtnEl.textContent = "Refresh Threads";
        });
    });
  }

  if (communityThreadListEl) {
    communityThreadListEl.addEventListener("click", function (event) {
      var target = event.target;
      if (!target || typeof target.closest !== "function") return;

      var loadBtn = target.closest("[data-community-load-replies]");
      if (loadBtn && communityThreadListEl.contains(loadBtn)) {
        var loadId = Number(loadBtn.getAttribute("data-community-load-replies") || 0);
        if (!(loadId > 0)) return;
        loadBtn.disabled = true;
        loadBtn.textContent = "Loading...";
        loadCommunityReplies(loadId)
          .catch(function (error) {
            setCommunityMessage(error && error.message ? error.message : "Could not load replies.", true);
          })
          .finally(function () {
            loadBtn.disabled = false;
            loadBtn.textContent = "View Replies";
          });
        return;
      }

      var editThreadBtn = target.closest("[data-community-thread-edit]");
      if (editThreadBtn && communityThreadListEl.contains(editThreadBtn)) {
        var editThreadId = Number(editThreadBtn.getAttribute("data-community-thread-edit") || 0);
        if (!(editThreadId > 0)) return;
        var thread = (state.communityThreads || []).find(function (row) {
          return Number(row && row.id || 0) === editThreadId;
        });
        if (!thread) return;
        openEditModal({
          modalTitle: "Edit Post",
          saveLabel: "Save Post",
          needsTitle: true,
          title: clean(thread.title),
          body: clean(thread.body),
        }).then(function (result) {
          if (!result) return;
          editThreadBtn.disabled = true;
          editThreadBtn.textContent = "Saving...";
          updateCommunityThread(editThreadId, result.title, result.body)
            .then(function () {
              setCommunityMessage("Post updated.", false);
            })
            .catch(function (error) {
              setCommunityMessage(error && error.message ? error.message : "Could not update post.", true);
            })
            .finally(function () {
              editThreadBtn.disabled = false;
              editThreadBtn.textContent = "Edit Post";
            });
          });
        return;
      }

      var deleteThreadBtn = target.closest("[data-community-thread-delete]");
      if (deleteThreadBtn && communityThreadListEl.contains(deleteThreadBtn)) {
        var deleteThreadId = Number(deleteThreadBtn.getAttribute("data-community-thread-delete") || 0);
        if (!(deleteThreadId > 0)) return;
        openConfirmModal({
          title: "Delete this post?",
          body: "This will permanently remove the post and all replies in this thread.",
          confirmLabel: "Delete Post",
          danger: true,
        }).then(function (ok) {
          if (!ok) return;
          deleteThreadBtn.disabled = true;
          deleteThreadBtn.textContent = "Deleting...";
          deleteCommunityThread(deleteThreadId)
            .then(function () {
              setCommunityMessage("Post deleted.", false);
            })
            .catch(function (error) {
              setCommunityMessage(error && error.message ? error.message : "Could not delete post.", true);
            })
            .finally(function () {
              deleteThreadBtn.disabled = false;
              deleteThreadBtn.textContent = "Delete Post";
            });
          });
        return;
      }

      var editReplyBtn = target.closest("[data-community-reply-edit]");
      if (editReplyBtn && communityThreadListEl.contains(editReplyBtn)) {
        var editReplyId = Number(editReplyBtn.getAttribute("data-community-reply-edit") || 0);
        var editThreadForReply = Number(editReplyBtn.getAttribute("data-community-thread-id") || 0);
        if (!(editReplyId > 0) || !(editThreadForReply > 0)) return;
        var existingReplies = state.communityRepliesByThread.get(editThreadForReply);
        var existing = Array.isArray(existingReplies) ? existingReplies.find(function (r) {
          return Number(r && r.id || 0) === editReplyId;
        }) : null;
        openEditModal({
          modalTitle: "Edit Reply",
          saveLabel: "Save Reply",
          needsTitle: false,
          body: clean(existing && existing.body),
        }).then(function (result) {
          if (!result) return;
          editReplyBtn.disabled = true;
          editReplyBtn.textContent = "Saving...";
          updateCommunityReply(editReplyId, result.body)
            .then(function () {
              setCommunityMessage("Reply updated.", false);
            })
            .catch(function (error) {
              setCommunityMessage(error && error.message ? error.message : "Could not update reply.", true);
            })
            .finally(function () {
              editReplyBtn.disabled = false;
              editReplyBtn.textContent = "Edit";
            });
          });
        return;
      }

      var deleteReplyBtn = target.closest("[data-community-reply-delete]");
      if (deleteReplyBtn && communityThreadListEl.contains(deleteReplyBtn)) {
        var deleteReplyId = Number(deleteReplyBtn.getAttribute("data-community-reply-delete") || 0);
        var deleteThreadForReply = Number(deleteReplyBtn.getAttribute("data-community-thread-id") || 0);
        if (!(deleteReplyId > 0) || !(deleteThreadForReply > 0)) return;
        openConfirmModal({
          title: "Delete this reply?",
          body: "This reply will be permanently removed from this discussion.",
          confirmLabel: "Delete Reply",
          danger: true,
        }).then(function (ok) {
          if (!ok) return;
          deleteReplyBtn.disabled = true;
          deleteReplyBtn.textContent = "Deleting...";
          deleteCommunityReply(deleteReplyId, deleteThreadForReply)
            .then(function () {
              setCommunityMessage("Reply deleted.", false);
            })
            .catch(function (error) {
              setCommunityMessage(error && error.message ? error.message : "Could not delete reply.", true);
            })
            .finally(function () {
              deleteReplyBtn.disabled = false;
              deleteReplyBtn.textContent = "Delete";
            });
          });
        return;
      }

      var replyBtn = target.closest("[data-community-reply-submit]");
      if (replyBtn && communityThreadListEl.contains(replyBtn)) {
        var threadId = Number(replyBtn.getAttribute("data-community-reply-submit") || 0);
        if (!(threadId > 0)) return;
        var input = communityThreadListEl.querySelector('[data-community-reply-input="' + String(threadId) + '"]');
        var text = clean(input && input.value);
        if (!text) {
          setCommunityMessage("Reply cannot be empty.", true);
          return;
        }
        replyBtn.disabled = true;
        replyBtn.textContent = "Posting...";
        submitCommunityReply(threadId, text)
          .then(function () {
            if (input) input.value = "";
            setCommunityMessage("Reply posted.", false);
          })
          .catch(function (error) {
            setCommunityMessage(error && error.message ? error.message : "Could not post reply.", true);
          })
          .finally(function () {
            replyBtn.disabled = false;
            replyBtn.textContent = "Reply";
          });
      }
    });
  }

  if (confirmModalBackdropEl) {
    confirmModalBackdropEl.addEventListener("click", function () {
      closeConfirmModal(false);
    });
  }
  if (confirmModalCloseEl) {
    confirmModalCloseEl.addEventListener("click", function () {
      closeConfirmModal(false);
    });
  }
  if (confirmModalCancelEl) {
    confirmModalCancelEl.addEventListener("click", function () {
      closeConfirmModal(false);
    });
  }
  if (confirmModalConfirmEl) {
    confirmModalConfirmEl.addEventListener("click", function () {
      closeConfirmModal(true);
    });
  }
  if (editModalBackdropEl) {
    editModalBackdropEl.addEventListener("click", function () {
      closeEditModal(false);
    });
  }
  if (editModalCloseEl) {
    editModalCloseEl.addEventListener("click", function () {
      closeEditModal(false);
    });
  }
  if (editModalCancelEl) {
    editModalCancelEl.addEventListener("click", function () {
      closeEditModal(false);
    });
  }
  if (editModalSaveEl) {
    editModalSaveEl.addEventListener("click", function () {
      closeEditModal(true);
    });
  }

  if (toggleTranscriptBtn) {
    toggleTranscriptBtn.addEventListener("click", function () {
      if (!transcriptPanelEl) return;
      var willOpen = !!transcriptPanelEl.hidden;
      if (!willOpen) {
        transcriptPanelEl.hidden = true;
        toggleTranscriptBtn.textContent = "Open transcript";
        return;
      }

      var lessonId = Number(state.activeLessonId || 0);
      if (!state.transcriptAccessAllowed || !lessonId) {
        setStatus("Transcript access requires approval.", false);
        return;
      }

      toggleTranscriptBtn.disabled = true;
      toggleTranscriptBtn.textContent = "Loading transcript...";
      fetchTranscriptForLesson(lessonId)
        .then(function () {
          transcriptPanelEl.hidden = false;
          toggleTranscriptBtn.textContent = "Close transcript";
          if (transcriptSearchInput && typeof transcriptSearchInput.focus === "function") {
            transcriptSearchInput.focus();
          }
        })
        .catch(function (error) {
          transcriptPanelEl.hidden = false;
          if (transcriptTextEl) {
            transcriptTextEl.textContent = clean(error && error.message) || "Could not load transcript.";
          }
          toggleTranscriptBtn.textContent = "Open transcript";
          setStatus(clean(error && error.message) || "Could not load transcript.", true);
        })
        .finally(function () {
          toggleTranscriptBtn.disabled = false;
        });
    });
  }

  if (requestTranscriptBtn) {
    requestTranscriptBtn.addEventListener("click", function () {
      var lessonId = Number(state.activeLessonId || 0);
      if (!lessonId || requestTranscriptBtn.disabled) return;
      requestTranscriptBtn.disabled = true;
      requestTranscriptBtn.textContent = "Submitting...";
      requestTranscriptAccessForLesson(lessonId)
        .then(function () {
          requestTranscriptBtn.textContent = "Transcript request pending";
          requestTranscriptBtn.disabled = true;
          if (transcriptTextEl) {
            transcriptTextEl.textContent = "Transcript request submitted. Access will appear here after approval.";
          }
          setStatus("Transcript access request submitted for review.", false);
        })
        .catch(function (error) {
          requestTranscriptBtn.disabled = false;
          requestTranscriptBtn.textContent = "Request transcript access";
          setStatus(clean(error && error.message) || "Could not submit transcript access request.", true);
        });
    });
  }

  if (toggleAudioDescriptionBtn) {
    toggleAudioDescriptionBtn.addEventListener("click", function () {
      if (!audioDescriptionPanelEl) return;
      var willOpen = !!audioDescriptionPanelEl.hidden;
      audioDescriptionPanelEl.hidden = !willOpen;
      toggleAudioDescriptionBtn.textContent = willOpen ? "Close audio description" : "Open audio description";
    });
  }

  if (toggleSignLanguageBtn) {
    toggleSignLanguageBtn.addEventListener("click", function () {
      if (toggleSignLanguageBtn.disabled) return;
      if (!signLanguagePanelEl) return;
      var willOpen = !!signLanguagePanelEl.hidden;
      signLanguagePanelEl.hidden = !willOpen;
      toggleSignLanguageBtn.textContent = willOpen ? "Close sign language" : "Open sign language";
      if (willOpen) renderSignLanguageMedia(state.signLanguageSourceUrl || "");
    });
  }

  if (transcriptSearchInput) {
    transcriptSearchInput.addEventListener("input", function () {
      renderTranscriptText(transcriptSearchInput.value || "");
    });
  }

  if (transcriptPanelEl) {
    transcriptPanelEl.addEventListener("copy", function (event) {
      event.preventDefault();
      setStatus("Transcript copying is disabled.", false);
    });
    transcriptPanelEl.addEventListener("cut", function (event) {
      event.preventDefault();
      setStatus("Transcript copying is disabled.", false);
    });
    transcriptPanelEl.addEventListener("contextmenu", function (event) {
      event.preventDefault();
    });
  }

  document.addEventListener("contextmenu", function (event) {
    var target = event && event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("#playerPane")) {
      event.preventDefault();
    }
  });

  document.addEventListener("dragstart", function (event) {
    var target = event && event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("#playerPane")) {
      event.preventDefault();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (!event) return;
    var key = String(event.key || "").toLowerCase();
    if (key === "escape" && confirmModalEl && !confirmModalEl.classList.contains("hidden")) {
      event.preventDefault();
      closeConfirmModal(false);
      return;
    }
    if (key === "escape" && editModalEl && !editModalEl.classList.contains("hidden")) {
      event.preventDefault();
      closeEditModal(false);
      return;
    }
    var hasModifier = !!(event.ctrlKey || event.metaKey);
    if (key === "printscreen" || key === "snapshot") {
      event.preventDefault();
      triggerCaptureShield();
      return;
    }
    if (hasModifier && (key === "s" || key === "p")) {
      var active = document.activeElement;
      if (active instanceof Element && active.closest("#playerPane")) {
        event.preventDefault();
        triggerCaptureShield();
      }
    }
    if (hasModifier && key === "c") {
      var activeEl = document.activeElement;
      if (activeEl instanceof Element && activeEl.closest("#lessonTranscriptPanel")) {
        event.preventDefault();
        setStatus("Transcript copying is disabled.", false);
      }
    }
  });

  window.addEventListener("beforeunload", function () {
    clearEmbedFallbackTimer();
    stopWatermarkTicker();
    stopWatchTracking(true, true);
    detachPlayer();
  });

  init();
})();
