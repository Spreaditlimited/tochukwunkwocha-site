(function () {
  const previewEl = document.getElementById("blogPreview");
  const messageEl = document.getElementById("blogPreviewMessage");

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function redirectToLogin() {
    const next = `${window.location.pathname}${window.location.search || ""}`;
    window.location.href = `/internal/?next=${encodeURIComponent(next)}`;
  }

  function setMessage(text, type) {
    if (!messageEl) return;
    messageEl.className = "mx-auto max-w-5xl rounded-2xl border bg-white p-5 text-sm font-semibold shadow-sm";
    messageEl.textContent = String(text || "");
    messageEl.classList.toggle("hidden", !text);
    if (type === "error") {
      messageEl.classList.add("border-red-200", "text-red-800");
      return;
    }
    messageEl.classList.add("border-gray-200", "text-gray-600");
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(String(value).replace(" ", "T"));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }

  function stripHtml(value) {
    const div = document.createElement("div");
    div.innerHTML = String(value || "");
    return String(div.textContent || "").replace(/\s+/g, " ").trim();
  }

  function estimateReadTime(html) {
    const words = stripHtml(html).split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(words / 220));
  }

  function sanitizeArticleHtml(value) {
    const template = document.createElement("template");
    template.innerHTML = String(value || "");
    template.content.querySelectorAll("script, style, link, meta, object, embed").forEach(function (node) {
      node.remove();
    });
    template.content.querySelectorAll("*").forEach(function (node) {
      Array.from(node.attributes || []).forEach(function (attr) {
        const name = String(attr.name || "").toLowerCase();
        const val = String(attr.value || "");
        if (name.indexOf("on") === 0 || (/^(href|src)$/i.test(name) && /^\s*javascript:/i.test(val))) {
          node.removeAttribute(attr.name);
        }
      });
    });
    return template.innerHTML;
  }

  async function requestPost(pidBlog) {
    const res = await fetch(`/.netlify/functions/admin-blog-get?pidBlog=${encodeURIComponent(pidBlog)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    if (res.status === 401) {
      redirectToLogin();
      return null;
    }
    const json = await res.json().catch(function () { return null; });
    if (!res.ok || !json || !json.ok) throw new Error((json && json.error) || "Could not load preview.");
    return json.data || null;
  }

  function renderPreview(post) {
    const title = String(post.blogTitle || "Untitled post");
    const excerpt = String(post.excerpt || "");
    const body = sanitizeArticleHtml(post.blogContent || "");
    const tags = Array.isArray(post.tags) ? post.tags.slice(0, 6) : [];
    const status = post.blogPublished ? "Published" : "Draft";
    const imageUrl = String(post.imageUrl || "");
    const publicUrl = post.blogSlug ? `/blog/${encodeURIComponent(post.blogSlug)}/` : "";

    previewEl.innerHTML = `
      <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-xs font-bold uppercase tracking-wider text-brand-600">Preview</p>
          <h1 class="mt-1 text-2xl font-heading font-extrabold text-gray-900">Public post layout</h1>
        </div>
        <div class="flex flex-wrap gap-2">
          <a href="/internal/blog/" class="rounded-xl bg-white px-4 py-2 text-sm font-bold text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50">Back to CMS</a>
          ${publicUrl ? `<a href="${escapeHtml(publicUrl)}" target="_blank" rel="noopener" class="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-500">Open public post</a>` : ""}
        </div>
      </div>

      <section class="overflow-hidden rounded-[2rem] border border-gray-200 bg-white shadow-sm">
        <div class="border-t-4 border-brand-600 p-6 sm:p-8 lg:p-12">
          <div class="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest text-brand-600">
            Prompt to Profit Insights
          </div>
          <h2 class="mt-6 max-w-4xl text-4xl font-heading font-extrabold leading-tight text-gray-950 sm:text-5xl">${escapeHtml(title)}</h2>
          ${excerpt ? `<p class="mt-5 max-w-3xl text-lg leading-8 text-gray-600">${escapeHtml(excerpt)}</p>` : ""}
          ${imageUrl ? `
            <figure class="mt-8 overflow-hidden rounded-[1.5rem] border border-gray-200 bg-gray-100 shadow-sm">
              <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" class="aspect-[16/9] w-full object-cover" />
            </figure>
          ` : `
            <div class="mt-8 flex aspect-[16/9] items-center justify-center rounded-[1.5rem] border border-dashed border-gray-300 bg-gray-50 text-sm font-bold uppercase tracking-wider text-gray-400">No featured image</div>
          `}
          <div class="mt-8 flex flex-wrap gap-2 border-t border-gray-100 pt-5">
            <span class="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-700">${escapeHtml(status)}</span>
            <span class="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-700">${escapeHtml(formatDate(post.createdAt))}</span>
            <span class="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-700">${estimateReadTime(body)} min read</span>
            ${tags.map(function (tag) {
              return `<span class="rounded-full bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700">${escapeHtml(tag)}</span>`;
            }).join("")}
          </div>
        </div>
      </section>

      <section class="mx-auto mt-8 max-w-4xl rounded-[1.5rem] border border-gray-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
        <div class="blog-preview-content">${body || '<p>No content yet.</p>'}</div>
      </section>
    `;

    previewEl.classList.remove("hidden");
    setMessage("", "");
  }

  async function init() {
    try {
      const params = new URLSearchParams(window.location.search || "");
      const pidBlog = String(params.get("pidBlog") || "").trim();
      if (!pidBlog) throw new Error("Missing blog post ID.");
      const post = await requestPost(pidBlog);
      if (!post) return;
      renderPreview(post);
    } catch (error) {
      setMessage(error.message || "Could not load preview.", "error");
    }
  }

  init();
})();
