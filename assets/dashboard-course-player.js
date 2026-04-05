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
  var markBtn = document.getElementById("markCompleteBtn");
  var progressBarEl = document.getElementById("playerProgressBar");
  var progressTextEl = document.getElementById("playerProgressText");
  var completionBadgeEl = document.getElementById("playerCompletionBadge");
  var retryBtn = document.getElementById("playerRetryBtn");
  var prevLessonBtn = document.getElementById("prevLessonBtn");
  var nextLessonBtn = document.getElementById("nextLessonBtn");
  var skeletonEl = document.getElementById("playerSkeleton");

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

  async function refreshCourse(openLessonId) {
    var payload = await api("/.netlify/functions/user-learning-course?course_slug=" + encodeURIComponent(state.courseSlug));
    var course = payload && payload.course ? payload.course : null;
    var account = payload && payload.account ? payload.account : null;
    state.account = account && typeof account === "object" ? account : null;
    startWatermarkTicker();
    var payloadError = validateCoursePayloadShape(course);
    if (payloadError) throw new Error(payloadError);

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

    if (titleEl) {
      var nice = state.courseSlug.split("-").map(function (part) {
        return part ? part.charAt(0).toUpperCase() + part.slice(1) : "";
      }).join(" ");
      titleEl.textContent = nice + " Player";
    }

    if (!state.lessonById.size) {
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
    if (!state.courseSlug) {
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
      setStatus(error.message || "Could not load course player.", true);
      showEmptyState({
        variant: "error",
        chip: "Load issue",
        title: "We could not load this course right now",
        body: clean(error.message || "Could not load course lessons."),
        hint: "Refresh this page. If it continues, sign out and back in.",
      });
      if (paneEl) paneEl.hidden = true;
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
          setStatus(error.message || "Could not refresh course.", true);
          showEmptyState({
            variant: "error",
            chip: "Load issue",
            title: "Refresh failed",
            body: clean(error.message || "Could not refresh this course."),
            hint: "Try again in a moment or return to My Courses.",
          });
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

  window.addEventListener("beforeunload", function () {
    clearEmbedFallbackTimer();
    stopWatermarkTicker();
    stopWatchTracking(true, true);
    detachPlayer();
  });

  init();
})();
