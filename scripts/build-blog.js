const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, 'content', 'blogs');
const OUTPUT_DIR = path.join(ROOT, 'blog');
const SITE_URL = clean(process.env.SITE_URL || 'https://tochukwunkwocha.com').replace(/\/+$/, '');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function clean(s) {
  return String(s || '').trim();
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function slugify(input) {
  return clean(input)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const INTERNAL_LINK_RULES = [
  { phrase: 'Prompt to Profit for Schools', href: '/courses/prompt-to-profit-schools/' },
  { phrase: 'Prompt to Profit Schools', href: '/courses/prompt-to-profit-schools/' },
  { phrase: 'Prompt to Profit AI for Schools', href: '/courses/prompt-to-profit-schools/' },
  { phrase: 'Prompt to Profit curriculum', href: '/courses/prompt-to-profit-schools/' },
  { phrase: 'Prompt to Profit program', href: '/courses/prompt-to-profit-schools/' },
  { phrase: 'Prompt to Profit system', href: '/courses/prompt-to-profit-schools/' },
  { phrase: 'Prompt to Profit for Kids', href: '/courses/prompt-to-profit-children/' },
  { phrase: 'Prompt to Profit Kids', href: '/courses/prompt-to-profit-children/' },
  { phrase: 'Prompt to Profit AI for Kids', href: '/courses/prompt-to-profit-children/' },
  { phrase: 'Prompt to Production', href: '/courses/prompt-to-production/' },
  { phrase: 'Prompt to Profit Advanced', href: '/courses/prompt-to-production/' },
  { phrase: 'domain registration', href: '/services/domain-registration/' },
];

function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function autoLinkInternalPhrases(html, state) {
  const input = String(html || '');
  const scopedState = state && state.usedHrefs instanceof Set ? state : { usedHrefs: new Set() };
  const protectedAnchors = [];
  const withPlaceholders = input.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, function (m) {
    const id = protectedAnchors.push(m) - 1;
    return `__LINK_TOKEN_${id}__`;
  });
  const chunks = withPlaceholders.split(/(<[^>]+>)/g);
  const processed = chunks.map(function (chunk) {
    if (!chunk || chunk.startsWith('<')) return chunk;
    let out = chunk;
    for (const rule of INTERNAL_LINK_RULES) {
      if (scopedState.usedHrefs.has(rule.href)) continue;
      const re = new RegExp(`\\b(${escapeRegex(rule.phrase)})\\b`, 'i');
      if (!re.test(out)) continue;
      out = out.replace(re, `<a href="${rule.href}">$1</a>`);
      scopedState.usedHrefs.add(rule.href);
    }
    return out;
  });
  const restored = processed.join('').replace(/__LINK_TOKEN_(\d+)__/g, function (_, idx) {
    return protectedAnchors[Number(idx)] || '';
  });
  return restored;
}

function parseFrontmatter(raw) {
  const text = String(raw || '');
  if (!text.startsWith('---\n')) return { data: {}, body: text };
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) return { data: {}, body: text };
  const fm = text.slice(4, end).split('\n');
  const body = text.slice(end + 5);
  const data = {};
  for (const line of fm) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = clean(line.slice(0, idx));
    let value = clean(line.slice(idx + 1));
    if (!key) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((x) => clean(x).replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    }
    data[key] = value;
  }
  return { data, body };
}

function renderInline(text, opts) {
  const input = opts && typeof opts === 'object' ? opts : {};
  let out = escapeHtml(text);
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*(.+?)\*/g, '<em>$1</em>');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  if (input.autoLink) {
    out = autoLinkInternalPhrases(out, input.linkState);
  }
  return out;
}

function markdownToHtml(md) {
  const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  const linkState = { usedHrefs: new Set() };
  let inList = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      continue;
    }
    if (/^#{1,6}\s+/.test(line)) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      const level = line.match(/^#+/)[0].length;
      const content = line.replace(/^#{1,6}\s+/, '');
      html.push(`<h${level}>${renderInline(content, { autoLink: false })}</h${level}>`);
      continue;
    }
    if (/^-\s+/.test(line)) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${renderInline(line.replace(/^-\s+/, ''), { autoLink: true, linkState })}</li>`);
      continue;
    }
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
    html.push(`<p>${renderInline(line, { autoLink: true, linkState })}</p>`);
  }
  if (inList) html.push('</ul>');
  return html.join('\n');
}

function injectInArticleCta(html) {
  const input = String(html || '');
  const blocks = input.match(/<(p|h[1-6]|ul)\b[\s\S]*?<\/\1>/gi) || [];
  if (!blocks.length) return input;
  const insertAfter = Math.max(2, Math.floor(blocks.length / 2));
  let seen = 0;
  const cta = `
<section class="my-8 sm:my-10 rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 via-white to-brand-100 p-5 sm:p-7 shadow-sm">
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <p class="text-[11px] font-extrabold uppercase tracking-[0.16em] text-brand-500">Build Practical AI Skills</p>
      <h3 class="mt-2 text-xl sm:text-2xl font-heading font-extrabold text-slate-900">Ready to move from reading to building?</h3>
      <p class="mt-2 text-slate-600 leading-relaxed">Explore our hands-on AI courses for schools, kids, and ambitious creators.</p>
    </div>
    <a href="/courses/" style="text-decoration:none;" class="inline-flex shrink-0 items-center justify-center rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold !text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2">
      Explore AI Courses
    </a>
  </div>
</section>`;
  return input.replace(/<(p|h[1-6]|ul)\b[\s\S]*?<\/\1>/gi, function (m) {
    seen += 1;
    if (seen === insertAfter) return `${m}\n${cta}`;
    return m;
  });
}

function stripHtml(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function estimateReadTimeMinutes(text) {
  const words = stripHtml(text).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

function toIsoDate(dateText) {
  const raw = clean(dateText);
  if (!raw) return '';
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toISOString();
}

function formatDateForHumans(dateText) {
  const d = new Date(dateText);
  if (!Number.isFinite(d.getTime())) return clean(dateText);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function pageShell(opts) {
  const input = opts && typeof opts === 'object' ? opts : {};
  const title = clean(input.title) || 'Blog';
  const description = clean(input.description) || '';
  const canonicalPath = clean(input.canonicalPath) || '/blog/';
  const canonicalUrl = `${SITE_URL}${canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`}`;
  const ogType = clean(input.ogType) || 'website';
  const ogImage = clean(input.ogImage) || `${SITE_URL}/assets/Proof/tochukwunkwocha-desktop.png`;
  const twitterCard = clean(input.twitterCard) || 'summary_large_image';
  const body = String(input.body || '');
  const articleJsonLd = input.articleJsonLd ? `<script type="application/ld+json">${JSON.stringify(input.articleJsonLd)}</script>` : '';
  const extraHead = String(input.extraHead || '');
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeCanonical = escapeHtml(canonicalUrl);
  const safeOgImage = escapeHtml(ogImage);
  const safeOgType = escapeHtml(ogType);
  const safeTwitterCard = escapeHtml(twitterCard);
  const safeSiteName = 'Tochukwu Tech and AI Academy';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDesc}" />
    <link rel="canonical" href="${safeCanonical}" />
    <meta property="og:type" content="${safeOgType}" />
    <meta property="og:site_name" content="${safeSiteName}" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDesc}" />
    <meta property="og:url" content="${safeCanonical}" />
    <meta property="og:image" content="${safeOgImage}" />
    <meta name="twitter:card" content="${safeTwitterCard}" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDesc}" />
    <meta name="twitter:image" content="${safeOgImage}" />
    ${extraHead}
    ${articleJsonLd}
    <link rel="icon" href="/favicon.ico" type="image/x-icon" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@700;800&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/assets/styles.css" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = {
        theme: {
          extend: {
            fontFamily: { sans: ["Inter", "sans-serif"], heading: ["Manrope", "sans-serif"] },
            colors: {
              brand: {
                50: "#eef2fb", 100: "#dfe7f7", 200: "#ccd3e6", 300: "#99a9cc", 400: "#667eb2",
                500: "#22345f", 600: "#1a2849", 700: "#14213d", 800: "#0f182d", 900: "#0a101e",
              },
            },
          },
        },
      };
    </script>
    <style>
      .tw-section-label {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        border-radius: 9999px;
        border: 1px solid #c8dced;
        background: #f0f5fa;
        padding: 0.35rem 0.85rem;
        font-size: 0.7rem;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #3f6ba4;
      }
      .blog-hero {
        position: relative;
        overflow: hidden;
        border-radius: 1.5rem;
        border: 1px solid #1f2f55;
        background: radial-gradient(circle at 20% 20%, rgba(117, 165, 208, 0.22), transparent 45%),
          linear-gradient(120deg, #0a1930 0%, #14213d 55%, #22345f 100%);
        color: #fff;
        box-shadow: 0 24px 60px rgba(10, 25, 48, 0.28);
      }
      .blog-hero-grid {
        position: absolute;
        inset: 0;
        opacity: 0.16;
        background-image: linear-gradient(to right, rgba(255,255,255,.2) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255,255,255,.2) 1px, transparent 1px);
        background-size: 24px 24px;
        pointer-events: none;
      }
      .blog-chip {
        border-radius: 9999px;
        border: 1px solid rgba(255,255,255,.28);
        background: rgba(255,255,255,.08);
        color: #dbeafe;
        font-size: 0.75rem;
        padding: 0.3rem 0.72rem;
        font-weight: 700;
      }
      .blog-shell {
        border-radius: 1.5rem;
        border: 1px solid #e2e8f0;
        background: #fff;
        box-shadow: 0 10px 36px rgba(15, 23, 42, 0.08);
      }
      .blog-content h1,.blog-content h2,.blog-content h3{font-family:Manrope,sans-serif;color:#0f172a;line-height:1.2;margin-top:1.4rem}
      .blog-content h2{font-size:1.7rem;margin-top:2.1rem;border-left:4px solid #75a5d0;padding-left:.7rem}
      .blog-content h3{font-size:1.28rem;margin-top:1.45rem}
      .blog-content p{color:#334155;line-height:1.9;margin-top:1rem;font-size:1.04rem}
      .blog-content ul{margin-top:1rem;padding-left:1.25rem;list-style:disc}
      .blog-content li{margin-top:.52rem;color:#334155;line-height:1.75}
      .blog-content a{color:#22345f;text-decoration:underline}
      .blog-content code{background:#f1f5f9;padding:.1rem .35rem;border-radius:.35rem}
      .blog-content strong{color:#0f172a}
      @media (max-width: 640px) {
        .blog-content p { font-size: 1rem; line-height: 1.8; }
        .blog-content h2 { font-size: 1.42rem; }
      }
    </style>
  </head>
  <body class="bg-slate-100 text-slate-900 font-sans antialiased">
    <header class="site-header">
      <div class="nav-wrap">
        <a class="logo" href="/">
          <img src="/assets/logo.png" alt="Tochukwu Nkwocha" class="logo-image" />
        </a>
        <button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false">☰</button>
        <nav class="nav-links" aria-label="Primary navigation">
          <a href="/">Home</a>
          <a href="/courses">Courses</a>
          <a href="/courses/prompt-to-profit-schools/">Schools</a>
          <a href="/courses/prompt-to-profit-children/">Kids</a>
          <a href="/services/domain-registration/">Domains</a>
          <div class="nav-dropdown">
            <button type="button" class="nav-dropdown-toggle nav-cta" aria-haspopup="true" aria-expanded="false">Sign in</button>
            <div class="nav-dropdown-menu">
              <a href="/schools/login/">School</a>
              <a href="/dashboard/">Individual</a>
            </div>
          </div>
        </nav>
      </div>
    </header>
    <main class="max-w-6xl mx-auto px-4 pt-16 pb-10 sm:pt-10 sm:pb-12">
      ${body}
    </main>
    <footer class="site-footer">
      <div class="footer-inner">
        <div class="footer-logo">
          <img src="/assets/revers_logo.png" alt="Tochukwu Nkwocha" class="footer-logo-image" />
        </div>
        <div class="footer-tagline">Practical AI. Real-world building.</div>
        <nav class="footer-links" aria-label="Footer links">
          <a href="/">Home</a>
          <a href="/blog/">Blog</a>
          <a href="/courses">Courses</a>
          <a href="/privacy-policy">Privacy</a>
          <a href="/terms-and-conditions">Terms</a>
          <a href="/contact">Contact</a>
        </nav>
        <p class="footer-note">&copy; 2026 Tochukwu Tech and AI Academy. All rights reserved.</p>
      </div>
    </footer>
    <script src="/assets/site.js"></script>
  </body>
</html>`;
}

function writePost(post) {
  const outDir = path.join(OUTPUT_DIR, post.slug);
  ensureDir(outDir);
  const tagBadges = (Array.isArray(post.tags) ? post.tags : [])
    .slice(0, 4)
    .map((tag) => `<span class="blog-chip">${escapeHtml(tag)}</span>`)
    .join('');
  const isoDate = toIsoDate(post.date);
  const readTime = estimateReadTimeMinutes(post.body);
  const humanDate = formatDateForHumans(post.date);
  const article = `
    <section class="mt-6 sm:mt-0 blog-hero p-6 sm:p-8 lg:p-10">
      <div class="blog-hero-grid"></div>
      <div class="relative z-10">
        <p class="tw-section-label">Prompt to Profit Insights</p>
        <h1 class="mt-4 text-3xl sm:text-4xl lg:text-5xl font-heading font-extrabold tracking-tight text-white">${escapeHtml(post.title)}</h1>
        <p class="mt-4 max-w-3xl text-base sm:text-lg leading-relaxed text-brand-100">${escapeHtml(post.excerpt || '')}</p>
        <div class="mt-5 flex flex-wrap items-center gap-2">
          <span class="blog-chip">${escapeHtml(humanDate)}</span>
          <span class="blog-chip">${readTime} min read</span>
          ${tagBadges}
        </div>
      </div>
    </section>
    <article class="blog-shell mt-6 p-6 sm:p-10">
      <a href="/blog/" class="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">← Back to blog</a>
      <div class="blog-content mt-7">
        ${injectInArticleCta(markdownToHtml(post.body))}
      </div>
    </article>
  `;
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt || '',
    image: `${SITE_URL}/assets/Proof/tochukwunkwocha-desktop.png`,
    author: { '@type': 'Organization', name: post.author || 'Tochukwu Tech and AI Academy' },
    publisher: {
      '@type': 'Organization',
      name: 'Tochukwu Tech and AI Academy',
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/assets/logo.png` },
    },
    datePublished: isoDate || undefined,
    dateModified: isoDate || undefined,
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}/`,
  };
  const extraHead = [
    `<meta name="author" content="${escapeHtml(post.author || 'Tochukwu Tech and AI Academy')}" />`,
    isoDate ? `<meta property="article:published_time" content="${escapeHtml(isoDate)}" />` : '',
    isoDate ? `<meta property="article:modified_time" content="${escapeHtml(isoDate)}" />` : '',
  ].filter(Boolean).join('\n');
  fs.writeFileSync(
    path.join(outDir, 'index.html'),
    pageShell({
      title: `${post.title} | Prompt to Profit Insights`,
      description: post.excerpt,
      canonicalPath: `/blog/${post.slug}/`,
      ogType: 'article',
      body: article,
      extraHead,
      articleJsonLd,
    }),
    'utf8'
  );
}

function writeIndex(posts) {
  ensureDir(OUTPUT_DIR);
  const indexPath = path.join(OUTPUT_DIR, 'index.html');
  // Preserve manually designed /blog/index.html pages by default.
  // Set BLOG_REBUILD_INDEX=1 when you explicitly want to regenerate it.
  if (fs.existsSync(indexPath) && String(process.env.BLOG_REBUILD_INDEX || '') !== '1') {
    console.log('Skipped blog index rebuild (existing custom blog/index.html preserved).');
    return;
  }
  const cards = posts
    .map((p) => `
      <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 class="text-xl font-bold"><a class="hover:underline" href="/blog/${p.slug}/">${escapeHtml(p.title)}</a></h2>
        <p class="mt-1 text-sm text-slate-500">${escapeHtml(p.date)}</p>
        <p class="mt-3 text-slate-700">${escapeHtml(p.excerpt || '')}</p>
        <a class="mt-4 inline-block text-brand-700 font-semibold hover:underline" href="/blog/${p.slug}/">Read article</a>
      </article>
    `)
    .join('\n');

  const body = `
    <section class="rounded-3xl border border-brand-200 bg-gradient-to-r from-brand-700 via-brand-600 to-brand-500 p-6 sm:p-8 text-white shadow-xl">
      <p class="text-xs uppercase tracking-widest font-bold text-brand-100">Insights</p>
      <h1 class="mt-2 text-3xl sm:text-4xl font-heading font-extrabold">Blog</h1>
      <p class="mt-2 text-brand-100">Practical updates on AI, schools, and digital skills training.</p>
    </section>
    <section class="mt-6 grid gap-4">
      ${cards || '<p class="text-slate-600">No published posts yet.</p>'}
    </section>
  `;
  fs.writeFileSync(indexPath, pageShell({
    title: 'Prompt to Profit Insights | Tochukwu Tech and AI Academy',
    description: 'Latest blog posts and insights on practical AI, schools, and digital skills.',
    canonicalPath: '/blog/',
    body,
  }), 'utf8');
}

function writeRss(posts) {
  const items = posts.map(function (post) {
    const link = `${SITE_URL}/blog/${post.slug}/`;
    const pubDate = toIsoDate(post.date) ? new Date(post.date).toUTCString() : new Date().toUTCString();
    return [
      '<item>',
      `<title>${escapeXml(post.title)}</title>`,
      `<link>${escapeXml(link)}</link>`,
      `<guid isPermaLink="true">${escapeXml(link)}</guid>`,
      `<description>${escapeXml(post.excerpt || '')}</description>`,
      `<pubDate>${escapeXml(pubDate)}</pubDate>`,
      '</item>',
    ].join('');
  }).join('\n');
  const rss = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>Prompt to Profit Insights</title>
    <link>${SITE_URL}/blog/</link>
    <description>Latest posts from Prompt to Profit Insights.</description>
    ${items}
  </channel>
</rss>`;
  fs.writeFileSync(path.join(OUTPUT_DIR, 'rss.xml'), rss, 'utf8');
}

function writeBlogSitemap(posts) {
  const urls = [`${SITE_URL}/blog/`].concat(posts.map(function (post) {
    return `${SITE_URL}/blog/${post.slug}/`;
  }));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(function (url) {
      return `  <url><loc>${escapeXml(url)}</loc></url>`;
    }).join('\n') +
    `\n</urlset>\n`;
  fs.writeFileSync(path.join(OUTPUT_DIR, 'sitemap.xml'), xml, 'utf8');
}

function build() {
  ensureDir(CONTENT_DIR);
  const files = fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'));
  const posts = [];
  for (const file of files) {
    const full = path.join(CONTENT_DIR, file);
    const raw = fs.readFileSync(full, 'utf8');
    const parsed = parseFrontmatter(raw);
    const title = clean(parsed.data.title) || file.replace(/\.md$/, '');
    const slug = clean(parsed.data.slug) || slugify(title);
    const published = parsed.data.published === true || String(parsed.data.published).toLowerCase() === 'true';
    if (!published) continue;
    posts.push({
      title,
      slug,
      date: clean(parsed.data.date) || '',
      excerpt: clean(parsed.data.excerpt) || '',
      tags: Array.isArray(parsed.data.tags) ? parsed.data.tags : [],
      author: clean(parsed.data.author) || 'Tochukwu Tech and AI Academy',
      body: parsed.body,
    });
  }

  posts.sort((a, b) => (a.date < b.date ? 1 : -1));
  writeIndex(posts);
  posts.forEach(writePost);
  writeRss(posts);
  writeBlogSitemap(posts);
  console.log(`Built blog: ${posts.length} published post(s)`);
}

build();
