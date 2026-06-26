(function () {
  const els = {
    rows: document.getElementById("blogRows"),
    message: document.getElementById("blogMessage"),
    search: document.getElementById("blogSearch"),
    status: document.getElementById("blogStatus"),
    form: document.getElementById("blogForm"),
    editorTitle: document.getElementById("blogEditorTitle"),
    pid: document.getElementById("blogPid"),
    title: document.getElementById("blogTitle"),
    author: document.getElementById("blogAuthor"),
    date: document.getElementById("blogDate"),
    excerpt: document.getElementById("blogExcerpt"),
    tags: document.getElementById("blogTags"),
    image: document.getElementById("blogImage"),
    imagePreview: document.getElementById("blogImagePreview"),
    generateImage: document.getElementById("blogGenerateImageBtn"),
    video: document.getElementById("blogVideo"),
    generateLeadMagnet: document.getElementById("blogGenerateLeadMagnetBtn"),
    leadMagnetEnabled: document.getElementById("leadMagnetEnabled"),
    leadMagnetTitle: document.getElementById("leadMagnetTitle"),
    leadMagnetOfferHeadline: document.getElementById("leadMagnetOfferHeadline"),
    leadMagnetDescription: document.getElementById("leadMagnetDescription"),
    leadMagnetBullets: document.getElementById("leadMagnetBullets"),
    leadMagnetButtonText: document.getElementById("leadMagnetButtonText"),
    leadMagnetEmailSubject: document.getElementById("leadMagnetEmailSubject"),
    leadMagnetDeliveryMessage: document.getElementById("leadMagnetDeliveryMessage"),
    leadMagnetFile: document.getElementById("leadMagnetFile"),
    leadMagnetPdfUrl: document.getElementById("leadMagnetPdfUrl"),
    leadMagnetPdfPublicId: document.getElementById("leadMagnetPdfPublicId"),
    leadMagnetPdfResourceType: document.getElementById("leadMagnetPdfResourceType"),
    leadMagnetPdfFilename: document.getElementById("leadMagnetPdfFilename"),
    leadMagnetCurrentFile: document.getElementById("leadMagnetCurrentFile"),
    published: document.getElementById("blogPublished"),
    featured: document.getElementById("blogFeatured"),
    content: document.getElementById("blogContent"),
    save: document.getElementById("blogSaveBtn"),
    preview: document.getElementById("blogPreviewBtn"),
    reset: document.getElementById("blogResetBtn"),
    del: document.getElementById("blogDeleteBtn"),
    statTotal: document.getElementById("blogStatTotal"),
    statPublished: document.getElementById("blogStatPublished"),
    statScheduled: document.getElementById("blogStatScheduled"),
    statDraft: document.getElementById("blogStatDraft"),
    newBtn: document.getElementById("blogNewBtn"),
    pagination: document.getElementById("blogPagination"),
    paginationSummary: document.getElementById("blogPaginationSummary"),
    pageSize: document.getElementById("blogPageSize"),
    prevPage: document.getElementById("blogPrevPage"),
    nextPage: document.getElementById("blogNextPage"),
    pageLabel: document.getElementById("blogPageLabel"),
  };

  const state = {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  };

  function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function decodeHtml(value) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = String(value || "");
    return textarea.value;
  }

  function htmlToPlainText(html) {
    const input = String(html || "")
      .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "- ")
      .replace(/<h([1-6])\b[^>]*>/gi, "\n# ");
    const container = document.createElement("div");
    container.innerHTML = input;
    return decodeHtml(container.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function plainTextToHtml(text) {
    const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
    const html = [];
    let paragraph = [];
    let inList = false;

    function flushParagraph() {
      if (!paragraph.length) return;
      html.push(`<p>${escapeHtml(paragraph.join(" "))}</p>`);
      paragraph = [];
    }

    function closeList() {
      if (!inList) return;
      html.push("</ul>");
      inList = false;
    }

    lines.forEach(function (rawLine) {
      const line = String(rawLine || "").trim();
      if (!line) {
        flushParagraph();
        closeList();
        return;
      }
      if (/^#{1,3}\s+/.test(line)) {
        flushParagraph();
        closeList();
        const level = Math.min(3, line.match(/^#+/)[0].length);
        html.push(`<h${level}>${escapeHtml(line.replace(/^#{1,3}\s+/, ""))}</h${level}>`);
        return;
      }
      if (/^-\s+/.test(line)) {
        flushParagraph();
        if (!inList) {
          html.push("<ul>");
          inList = true;
        }
        html.push(`<li>${escapeHtml(line.replace(/^-\s+/, ""))}</li>`);
        return;
      }
      closeList();
      paragraph.push(line);
    });

    flushParagraph();
    closeList();
    return html.join("\n");
  }

  function setMessage(text, type) {
    if (!els.message) return;
    els.message.classList.toggle("hidden", !text);
    els.message.textContent = text || "";
    els.message.className = "mb-4 rounded-xl border px-4 py-3 text-sm font-semibold";
    if (!text) els.message.classList.add("hidden");
    else if (type === "error") els.message.classList.add("border-red-200", "bg-red-50", "text-red-800");
    else els.message.classList.add("border-emerald-200", "bg-emerald-50", "text-emerald-800");
  }

  function redirectToLogin() {
    window.location.href = `/internal/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function toDatetimeLocal(value) {
    const date = value ? new Date(String(value).replace(" ", "T")) : new Date();
    if (Number.isNaN(date.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function renderRows(posts) {
    const rows = Array.isArray(posts) ? posts : [];
    if (!els.rows) return;
    if (!rows.length) {
      els.rows.innerHTML = '<p class="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500">No blog posts found.</p>';
      return;
    }
    els.rows.innerHTML = rows.map(function (post) {
      const status = post.blogPublished ? (new Date(String(post.createdAt || "").replace(" ", "T")).getTime() > Date.now() ? "Scheduled" : "Published") : "Draft";
      return `
        <article class="grid gap-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-[9rem_minmax(0,1fr)_auto]">
          <div class="aspect-[16/10] overflow-hidden rounded-xl bg-gray-100">
            ${post.imageUrl ? `<img src="${escapeHtml(post.imageUrl)}" alt="" class="h-full w-full object-cover" />` : '<div class="flex h-full w-full items-center justify-center text-xs font-bold uppercase text-gray-400">No image</div>'}
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-700">${escapeHtml(status)}</span>
              ${post.blogFeatured ? '<span class="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">Featured</span>' : ""}
              ${post.leadMagnet && post.leadMagnet.active ? '<span class="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">PDF offer</span>' : ""}
              <span class="text-xs text-gray-500">${escapeHtml(formatDate(post.createdAt))}</span>
            </div>
            <h3 class="mt-2 text-lg font-heading font-extrabold text-gray-900">${escapeHtml(post.blogTitle)}</h3>
            <p class="mt-1 line-clamp-2 text-sm text-gray-500">${escapeHtml(post.excerpt || "")}</p>
            <p class="mt-2 font-mono text-xs text-gray-400">/blog/${escapeHtml(post.blogSlug)}/</p>
          </div>
          <div class="flex flex-wrap items-start gap-2 sm:justify-end">
            <a href="/internal/blog/preview.html?pidBlog=${encodeURIComponent(post.pidBlog)}" target="_blank" rel="noopener" class="rounded-xl bg-brand-600 px-3 py-2 text-sm font-bold text-white hover:bg-brand-500">Preview</a>
            <button type="button" data-edit="${escapeHtml(post.pidBlog)}" class="rounded-xl bg-white px-3 py-2 text-sm font-bold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50">Edit</button>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderPagination(pagination) {
    const meta = pagination && typeof pagination === "object" ? pagination : {};
    const total = Math.max(0, Number(meta.total || 0));
    const page = Math.max(1, Number(meta.page || state.page || 1));
    const limit = Math.max(1, Number(meta.limit || state.limit || 20));
    const totalPages = Math.max(1, Number(meta.totalPages || Math.ceil(total / limit) || 1));
    state.page = Math.min(page, totalPages);
    state.limit = limit;
    state.total = total;
    state.totalPages = totalPages;

    if (els.pageSize && String(els.pageSize.value) !== String(limit)) {
      els.pageSize.value = String(limit);
    }
    if (els.pagination) els.pagination.classList.toggle("hidden", total === 0);
    if (els.pageLabel) els.pageLabel.textContent = `Page ${state.page} of ${totalPages}`;
    if (els.prevPage) els.prevPage.disabled = state.page <= 1;
    if (els.nextPage) els.nextPage.disabled = state.page >= totalPages;
    if (els.paginationSummary) {
      const from = total ? ((state.page - 1) * limit) + 1 : 0;
      const to = Math.min(total, state.page * limit);
      els.paginationSummary.textContent = total
        ? `Showing ${from.toLocaleString()}-${to.toLocaleString()} of ${total.toLocaleString()} posts`
        : "No posts found";
    }
  }

  async function requestJson(url, options) {
    const res = await fetch(url, Object.assign({ credentials: "include", headers: { Accept: "application/json" } }, options || {}));
    if (res.status === 401) {
      redirectToLogin();
      return null;
    }
    const data = await res.json().catch(function () { return null; });
    if (!res.ok || !data || !data.ok) throw new Error((data && data.error) || "Request failed.");
    return data;
  }

  async function loadPosts() {
    try {
      const params = new URLSearchParams();
      params.set("page", String(state.page));
      params.set("limit", String(state.limit));
      if (els.search && els.search.value) params.set("search", els.search.value);
      if (els.status && els.status.value) params.set("status", els.status.value);
      const data = await requestJson(`/.netlify/functions/admin-blog-list?${params.toString()}`);
      if (!data) return;
      renderRows(data.data);
      renderPagination(data.pagination);
      const stats = data.stats || {};
      if (els.statTotal) els.statTotal.textContent = Number(stats.totalArticles || 0).toLocaleString();
      if (els.statPublished) els.statPublished.textContent = Number(stats.publishedArticles || 0).toLocaleString();
      if (els.statScheduled) els.statScheduled.textContent = Number(stats.scheduledArticles || 0).toLocaleString();
      if (els.statDraft) els.statDraft.textContent = Number(stats.draftArticles || 0).toLocaleString();
    } catch (error) {
      setMessage(error.message || "Could not load posts.", "error");
    }
  }

  function goToPage(page) {
    const nextPage = Math.max(1, Math.min(Number(page) || 1, state.totalPages || 1));
    if (nextPage === state.page) return;
    state.page = nextPage;
    loadPosts();
  }

  function resetListPageAndLoad() {
    state.page = 1;
    loadPosts();
  }

  function resetForm() {
    if (!els.form) return;
    els.form.reset();
    els.pid.value = "";
    els.author.value = "Tochukwu Nkwocha";
    els.date.value = toDatetimeLocal(new Date());
    els.editorTitle.textContent = "New post";
    els.del.classList.add("hidden");
    if (els.preview) {
      els.preview.classList.add("hidden");
      els.preview.removeAttribute("href");
    }
    els.imagePreview.classList.add("hidden");
    els.imagePreview.removeAttribute("src");
    if (els.leadMagnetEnabled) els.leadMagnetEnabled.checked = false;
    if (els.leadMagnetTitle) els.leadMagnetTitle.value = "";
    if (els.leadMagnetOfferHeadline) els.leadMagnetOfferHeadline.value = "";
    if (els.leadMagnetDescription) els.leadMagnetDescription.value = "";
    if (els.leadMagnetBullets) els.leadMagnetBullets.value = "";
    if (els.leadMagnetButtonText) els.leadMagnetButtonText.value = "Send me the PDF";
    if (els.leadMagnetEmailSubject) els.leadMagnetEmailSubject.value = "";
    if (els.leadMagnetDeliveryMessage) els.leadMagnetDeliveryMessage.value = "";
    if (els.leadMagnetPdfUrl) els.leadMagnetPdfUrl.value = "";
    if (els.leadMagnetPdfPublicId) els.leadMagnetPdfPublicId.value = "";
    if (els.leadMagnetPdfResourceType) els.leadMagnetPdfResourceType.value = "";
    if (els.leadMagnetPdfFilename) els.leadMagnetPdfFilename.value = "";
    if (els.leadMagnetCurrentFile) els.leadMagnetCurrentFile.textContent = "No PDF attached.";
  }

  async function editPost(pidBlog) {
    try {
      const data = await requestJson(`/.netlify/functions/admin-blog-get?pidBlog=${encodeURIComponent(pidBlog)}`);
      if (!data) return;
      const post = data.data || {};
      els.pid.value = post.pidBlog || "";
      els.title.value = post.blogTitle || "";
      els.author.value = post.blogBy || "Tochukwu Nkwocha";
      els.date.value = toDatetimeLocal(post.createdAt);
      els.excerpt.value = post.excerpt || "";
      els.tags.value = Array.isArray(post.tags) ? post.tags.join(", ") : "";
      els.video.value = post.blogExt1 || "";
      const leadMagnet = post.leadMagnet || {};
      if (els.leadMagnetEnabled) els.leadMagnetEnabled.checked = Boolean(leadMagnet.active);
      if (els.leadMagnetTitle) els.leadMagnetTitle.value = leadMagnet.title || "";
      if (els.leadMagnetOfferHeadline) els.leadMagnetOfferHeadline.value = leadMagnet.offerHeadline || "";
      if (els.leadMagnetDescription) els.leadMagnetDescription.value = leadMagnet.description || "";
      if (els.leadMagnetBullets) els.leadMagnetBullets.value = Array.isArray(leadMagnet.bullets) ? leadMagnet.bullets.map(function (item) { return "- " + item; }).join("\n") : "";
      if (els.leadMagnetButtonText) els.leadMagnetButtonText.value = leadMagnet.buttonText || "Send me the PDF";
      if (els.leadMagnetEmailSubject) els.leadMagnetEmailSubject.value = leadMagnet.emailSubject || "";
      if (els.leadMagnetDeliveryMessage) els.leadMagnetDeliveryMessage.value = leadMagnet.deliveryMessage || "";
      if (els.leadMagnetPdfUrl) els.leadMagnetPdfUrl.value = leadMagnet.pdfUrl || "";
      if (els.leadMagnetPdfPublicId) els.leadMagnetPdfPublicId.value = leadMagnet.pdfPublicId || "";
      if (els.leadMagnetPdfResourceType) els.leadMagnetPdfResourceType.value = leadMagnet.pdfResourceType || "image";
      if (els.leadMagnetPdfFilename) els.leadMagnetPdfFilename.value = leadMagnet.pdfFilename || "";
      if (els.leadMagnetCurrentFile) {
        els.leadMagnetCurrentFile.innerHTML = leadMagnet.pdfUrl
          ? `Current PDF: <a class="font-bold text-brand-700 underline" href="${escapeHtml(leadMagnet.pdfUrl)}" target="_blank" rel="noopener">${escapeHtml(leadMagnet.pdfFilename || "Open PDF")}</a>`
          : "No PDF attached.";
      }
      els.published.checked = Boolean(post.blogPublished);
      els.featured.checked = Boolean(post.blogFeatured);
      els.content.value = htmlToPlainText(post.blogContent || "");
      els.editorTitle.textContent = "Edit post";
      els.del.classList.remove("hidden");
      if (els.preview) {
        els.preview.href = `/internal/blog/preview.html?pidBlog=${encodeURIComponent(post.pidBlog || "")}`;
        els.preview.classList.remove("hidden");
      }
      if (post.imageUrl) {
        els.imagePreview.src = post.imageUrl;
        els.imagePreview.classList.remove("hidden");
      } else {
        els.imagePreview.classList.add("hidden");
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setMessage(error.message || "Could not load post.", "error");
    }
  }

  async function savePost(event) {
    event.preventDefault();
    if (els.save) {
      els.save.disabled = true;
      els.save.textContent = "Saving...";
    }
    setMessage("", "success");
    try {
      const form = new FormData();
      if (els.pid.value) form.append("pidBlog", els.pid.value);
      form.append("blogTitle", els.title.value);
      form.append("blogContent", plainTextToHtml(els.content.value));
      form.append("blogBy", els.author.value);
      form.append("createdAt", els.date.value ? els.date.value.replace("T", " ") + ":00" : "");
      form.append("excerpt", els.excerpt.value);
      form.append("tags", els.tags.value);
      form.append("blogExt1", els.video.value);
      form.append("leadMagnetEnabled", els.leadMagnetEnabled && els.leadMagnetEnabled.checked ? "true" : "false");
      form.append("leadMagnetTitle", els.leadMagnetTitle ? els.leadMagnetTitle.value : "");
      form.append("leadMagnetOfferHeadline", els.leadMagnetOfferHeadline ? els.leadMagnetOfferHeadline.value : "");
      form.append("leadMagnetDescription", els.leadMagnetDescription ? els.leadMagnetDescription.value : "");
      form.append("leadMagnetBullets", els.leadMagnetBullets ? els.leadMagnetBullets.value : "");
      form.append("leadMagnetButtonText", els.leadMagnetButtonText ? els.leadMagnetButtonText.value : "");
      form.append("leadMagnetEmailSubject", els.leadMagnetEmailSubject ? els.leadMagnetEmailSubject.value : "");
      form.append("leadMagnetDeliveryMessage", els.leadMagnetDeliveryMessage ? els.leadMagnetDeliveryMessage.value : "");
      form.append("leadMagnetPdfUrl", els.leadMagnetPdfUrl ? els.leadMagnetPdfUrl.value : "");
      form.append("leadMagnetPdfPublicId", els.leadMagnetPdfPublicId ? els.leadMagnetPdfPublicId.value : "");
      form.append("leadMagnetPdfResourceType", els.leadMagnetPdfResourceType ? els.leadMagnetPdfResourceType.value : "");
      form.append("leadMagnetPdfFilename", els.leadMagnetPdfFilename ? els.leadMagnetPdfFilename.value : "");
      form.append("blogPublished", els.published.checked ? "true" : "false");
      form.append("blogFeatured", els.featured.checked ? "true" : "false");
      if (els.image.files && els.image.files[0]) form.append("file", els.image.files[0]);
      if (els.leadMagnetFile && els.leadMagnetFile.files && els.leadMagnetFile.files[0]) form.append("leadMagnetFile", els.leadMagnetFile.files[0]);
      const data = await requestJson("/.netlify/functions/admin-blog-save", { method: "POST", body: form, headers: { Accept: "application/json" } });
      if (!data) return;
      setMessage("Blog post saved.", "success");
      await editPost(data.data.pidBlog);
      await loadPosts();
    } catch (error) {
      setMessage(error.message || "Could not save post.", "error");
    } finally {
      if (els.save) {
        els.save.disabled = false;
        els.save.textContent = "Save post";
      }
    }
  }

  async function generateImageForCurrentPost() {
    const pidBlog = els.pid && els.pid.value ? els.pid.value : "";
    if (!pidBlog) {
      setMessage("Save the post before generating an image.", "error");
      return;
    }
    if (els.generateImage) {
      els.generateImage.disabled = true;
      els.generateImage.textContent = "Generating...";
    }
    setMessage("Generating image. This can take up to two minutes.", "success");
    try {
      const data = await requestJson("/.netlify/functions/admin-blog-generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ pidBlog }),
      });
      if (!data) return;
      const jobUuid = data.job && data.job.jobUuid ? String(data.job.jobUuid) : "";
      if (!jobUuid) throw new Error("Image job did not start.");
      fetch("/.netlify/functions/admin-blog-generate-image-background", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({ jobUuid }),
      }).catch(function () {});
      await pollImageJob(jobUuid);
      await loadPosts();
    } catch (error) {
      setMessage(error.message || "Could not generate image.", "error");
    } finally {
      if (els.generateImage) {
        els.generateImage.disabled = false;
        els.generateImage.textContent = "Generate image";
      }
    }
  }

  async function pollImageJob(jobUuid) {
    const startedAt = Date.now();
    const maxWaitMs = 4 * 60 * 1000;
    while (Date.now() - startedAt < maxWaitMs) {
      await new Promise(function (resolve) { window.setTimeout(resolve, 3000); });
      const data = await requestJson(`/.netlify/functions/admin-blog-image-job?jobUuid=${encodeURIComponent(jobUuid)}`);
      if (!data) return;
      const job = data.job || {};
      const status = String(job.status || "").toLowerCase();
      if (status === "failed") throw new Error(job.errorMessage || "Image generation failed.");
      if (status === "succeeded") {
        if (job.imageUrl && els.imagePreview) {
          els.imagePreview.src = job.imageUrl;
          els.imagePreview.classList.remove("hidden");
        }
        setMessage("Generated and attached a new blog image.", "success");
        if (els.pid && els.pid.value) await editPost(els.pid.value);
        return;
      }
      setMessage(status === "running" ? "Generating image..." : "Image generation queued...", "success");
    }
    throw new Error("Image generation is still running. Check again shortly.");
  }

  async function generateLeadMagnetForCurrentPost() {
    const pidBlog = els.pid && els.pid.value ? els.pid.value : "";
    if (!pidBlog) {
      setMessage("Save the post before generating a PDF lead magnet.", "error");
      return;
    }
    if (els.generateLeadMagnet) {
      els.generateLeadMagnet.disabled = true;
      els.generateLeadMagnet.textContent = "Generating...";
    }
    setMessage("Generating lead magnet and PDF. This can take up to two minutes.", "success");
    try {
      const data = await requestJson("/.netlify/functions/admin-blog-generate-lead-magnet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ pidBlog }),
      });
      if (!data) return;
      setMessage("Generated and attached the PDF lead magnet.", "success");
      if (els.pid && els.pid.value) await editPost(els.pid.value);
      await loadPosts();
    } catch (error) {
      setMessage(error.message || "Could not generate PDF lead magnet.", "error");
    } finally {
      if (els.generateLeadMagnet) {
        els.generateLeadMagnet.disabled = false;
        els.generateLeadMagnet.textContent = "Generate PDF and lead magnet";
      }
    }
  }

  async function deleteCurrentPost() {
    const pidBlog = els.pid.value;
    if (!pidBlog) return;
    if (!window.confirm("Delete this blog post?")) return;
    try {
      await requestJson(`/.netlify/functions/admin-blog-delete?pidBlog=${encodeURIComponent(pidBlog)}`, { method: "DELETE" });
      setMessage("Blog post deleted.", "success");
      resetForm();
      await loadPosts();
    } catch (error) {
      setMessage(error.message || "Could not delete post.", "error");
    }
  }

  if (els.rows) {
    els.rows.addEventListener("click", function (event) {
      const button = event.target && event.target.closest ? event.target.closest("[data-edit]") : null;
      if (button) editPost(button.getAttribute("data-edit"));
    });
  }
  if (els.form) els.form.addEventListener("submit", savePost);
  if (els.generateImage) els.generateImage.addEventListener("click", generateImageForCurrentPost);
  if (els.generateLeadMagnet) els.generateLeadMagnet.addEventListener("click", generateLeadMagnetForCurrentPost);
  if (els.reset) els.reset.addEventListener("click", resetForm);
  if (els.del) els.del.addEventListener("click", deleteCurrentPost);
  if (els.newBtn) els.newBtn.addEventListener("click", resetForm);
  if (els.prevPage) els.prevPage.addEventListener("click", function () { goToPage(state.page - 1); });
  if (els.nextPage) els.nextPage.addEventListener("click", function () { goToPage(state.page + 1); });
  if (els.pageSize) {
    els.pageSize.value = String(state.limit);
    els.pageSize.addEventListener("change", function () {
      state.limit = Math.max(1, Number(els.pageSize.value || 20));
      resetListPageAndLoad();
    });
  }
  if (els.search) els.search.addEventListener("input", function () { window.clearTimeout(els.search._timer); els.search._timer = window.setTimeout(resetListPageAndLoad, 250); });
  if (els.status) els.status.addEventListener("change", resetListPageAndLoad);
  if (els.image) {
    els.image.addEventListener("change", function () {
      const file = els.image.files && els.image.files[0];
      if (!file) return;
      els.imagePreview.src = URL.createObjectURL(file);
      els.imagePreview.classList.remove("hidden");
    });
  }
  if (els.leadMagnetFile) {
    els.leadMagnetFile.addEventListener("change", function () {
      const file = els.leadMagnetFile.files && els.leadMagnetFile.files[0];
      if (els.leadMagnetCurrentFile && file) els.leadMagnetCurrentFile.textContent = `Selected PDF: ${file.name}`;
    });
  }

  resetForm();
  loadPosts();
})();
