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

function absoluteAssetUrl(assetPath) {
  const raw = clean(assetPath);
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return `${SITE_URL}${raw.startsWith('/') ? raw : `/${raw}`}`;
}

function getPostImageUrl(post) {
  return absoluteAssetUrl(post && post.image) || `${SITE_URL}/assets/Proof/tochukwunkwocha-desktop.png`;
}

function getSeoTitle(post) {
  return clean(post && post.seoTitle) || `${clean(post && post.title)} | Prompt to Profit`;
}

function getRelatedPosts(post, posts) {
  const currentTags = new Set(Array.isArray(post.tags) ? post.tags.map((tag) => String(tag).toLowerCase()) : []);
  return posts
    .filter((candidate) => candidate.slug !== post.slug)
    .map((candidate) => {
      const score = (Array.isArray(candidate.tags) ? candidate.tags : [])
        .reduce((total, tag) => total + (currentTags.has(String(tag).toLowerCase()) ? 1 : 0), 0);
      return { post: candidate, score };
    })
    .sort((a, b) => b.score - a.score || (a.post.date < b.post.date ? 1 : -1))
    .slice(0, 3)
    .map((item) => item.post);
}

function renderRelatedPosts(post, posts) {
  const related = getRelatedPosts(post, posts);
  if (!related.length) return '';
  return `
    <section class="mt-12 border-t border-slate-200 pt-8">
      <p class="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Related articles</p>
      <div class="mt-5 grid gap-4">
        ${related.map((item) => `
          <a href="/blog/${item.slug}/" class="group block rounded-xl border border-slate-200 bg-white p-4 no-underline transition hover:border-brand-300 hover:shadow-sm">
            <p class="!mt-0 font-heading text-lg font-bold leading-snug text-slate-950 group-hover:text-brand-700">${escapeHtml(item.title)}</p>
            <p class="mt-2 text-sm leading-relaxed text-slate-600">${escapeHtml(item.excerpt || '')}</p>
          </a>
        `).join('')}
      </div>
    </section>
  `;
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
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@700;800&family=Playfair+Display:wght@400;500;600&display=swap" rel="stylesheet" />
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
      .blog-hero {
        position: relative;
        overflow: hidden;
        border-radius: 0.5rem;
        border: 1px solid rgba(17, 17, 17, 0.06);
        background: #ffffff;
        padding: clamp(2rem, 6vw, 4.5rem);
        box-shadow: 0 30px 70px rgba(0, 0, 0, 0.03);
      }
      .blog-hero-grid {
        display: none;
      }
      .blog-kicker {
        color: #9b7b4f;
        font-size: 0.7rem;
        font-weight: 600;
        letter-spacing: 0.2em;
        text-transform: uppercase;
      }
      .blog-title {
        margin-top: 1rem;
        max-width: 920px;
        font-family: "Playfair Display", Georgia, serif;
        font-size: clamp(2.25rem, 6vw, 4.5rem);
        line-height: 1.1;
        color: #111111;
        font-weight: 400;
      }
      .blog-excerpt {
        margin-top: 1.35rem;
        max-width: 760px;
        color: #4b5563;
        font-size: clamp(1rem, 2vw, 1.2rem);
        line-height: 1.8;
      }
      .blog-meta {
        margin-top: 2rem;
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
      }
      .blog-chip {
        border-radius: 0;
        border-bottom: 1px solid #111111;
        background: transparent;
        padding: 0.25rem 0;
        font-size: 0.75rem;
        font-weight: 500;
        letter-spacing: 0.05em;
        color: #666666;
      }
      .blog-shell {
        margin-top: 3rem;
        background: transparent;
        border: none;
        padding: 0;
      }
      .blog-content {
        max-width: 680px;
        margin-inline: auto;
        font-family: Inter, system-ui, sans-serif;
      }
      .blog-content p {
        margin-top: 1.75rem;
        color: #2d2d2d;
        font-size: 1.125rem;
        line-height: 1.95;
      }
      .blog-content > p:first-of-type::first-letter {
        font-family: "Playfair Display", Georgia, serif;
        font-size: 4.5rem;
        float: left;
        line-height: 0.8;
        margin-top: 0.15rem;
        margin-right: 0.75rem;
        color: #111111;
      }
      .blog-content h1,.blog-content h2,.blog-content h3 {
        font-family: "Playfair Display", Georgia, serif;
        color: #111111;
        line-height: 1.25;
        font-weight: 400;
      }
      .blog-content h2 {
        margin-top: 4rem;
        font-size: clamp(1.75rem, 4vw, 2.5rem);
      }
      .blog-content h3 {
        margin-top: 2.5rem;
        font-size: 1.4rem;
      }
      .blog-content ul {
        margin-top: 1.5rem;
        padding-left: 1.5rem;
        list-style-type: square;
      }
      .blog-content li {
        margin-top: 0.75rem;
        color: #2d2d2d;
        line-height: 1.85;
      }
      .blog-content a {
        color: #111111;
        font-weight: 500;
        text-decoration: none;
        border-bottom: 1px solid rgba(17, 17, 17, 0.3);
        transition: border-color 0.3s ease, color 0.3s ease;
      }
      .blog-content a:hover {
        color: #9b7b4f;
        border-bottom-color: #9b7b4f;
      }
      .blog-content code{background:#f1f5f9;padding:.1rem .35rem;border-radius:.35rem}
      .blog-content strong{color:#111111}
      @media (max-width: 640px) {
        .blog-hero { padding: 1.5rem; }
        .blog-content p { font-size: 1rem; line-height: 1.85; }
        .blog-content > p:first-of-type::first-letter { font-size: 3.4rem; }
      }
    </style>
  </head>
  <body class="bg-slate-100 text-slate-900 font-sans antialiased">
    <header class="site-header">
      <div class="nav-wrap">
        <a class="logo" href="/">
          <img src="/assets/revers_logo.png" alt="Tochukwu Nkwocha" class="logo-image" />
        </a>
        <button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false">☰</button>
        <nav class="nav-links" aria-label="Primary navigation">
          <a href="/">Home</a>
          <a href="/courses">Courses</a>
          <a href="/courses/prompt-to-profit-schools/">Schools</a>
          <a href="/build/">Build</a>
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
    <footer class="site-footer relative overflow-hidden bg-[#060b14] pt-20 pb-10 border-t border-white/5 mt-auto">
  <div class="absolute bottom-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-brand-500/10 rounded-full blur-[120px] pointer-events-none z-0"></div>
  
  <div class="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGNpcmNsZSBjeD0iMjMiIGN5PSIyMyIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjAyKSIvPjwvc3ZnPg==')] z-0 pointer-events-none" style="mask-image: linear-gradient(to top, transparent, black);"></div>

  <div class="footer-inner relative z-10 max-w-7xl mx-auto px-6 flex flex-col items-center text-center">
    
    <div class="footer-logo mb-6">
      <a href="/" class="block transition-transform hover:scale-105 duration-300">
        <img src="/assets/revers_logo.png" alt="Tochukwu Nkwocha" class="footer-logo-image h-10 w-auto filter drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]" />
      </a>
    </div>
    
    <div class="footer-tagline text-transparent bg-clip-text bg-gradient-to-r from-brand-400 to-purple-400 font-mono font-bold tracking-widest uppercase text-[11px] mb-12 flex items-center gap-4">
      <span class="w-8 h-px bg-brand-500/30"></span>
      Practical AI. Real-world building.
      <span class="w-8 h-px bg-purple-500/30"></span>
    </div>
    
    <nav class="footer-links flex flex-wrap justify-center gap-x-10 gap-y-4 mb-12" aria-label="Footer links">
      <a href="/" class="text-slate-400 hover:text-white text-sm font-medium transition-colors hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">Home</a>
      <a href="/courses" class="text-slate-400 hover:text-white text-sm font-medium transition-colors hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">Courses</a>
      <a href="/blog/" class="text-slate-400 hover:text-white text-sm font-medium transition-colors hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">Blog</a>
      <a href="/privacy-policy" class="text-slate-400 hover:text-white text-sm font-medium transition-colors hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">Privacy</a>
      <a href="/terms-and-conditions" class="text-slate-400 hover:text-white text-sm font-medium transition-colors hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">Terms</a>
      <a href="/contact" class="text-slate-400 hover:text-white text-sm font-medium transition-colors hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">Contact</a>
    </nav>
    
    <div class="w-full max-w-3xl border-t border-white/5 pt-8 flex flex-col items-center justify-center">
      <p class="footer-note text-slate-500 text-xs font-light tracking-wide">
        &copy; 2026 Tochukwu Tech and AI Academy. All rights reserved.
      </p>
    </div>
    
  </div>
</footer>

    <script src="/assets/site.js"></script>
  </body>
</html>`;
}

function writePost(post, posts) {
  const outDir = path.join(OUTPUT_DIR, post.slug);
  ensureDir(outDir);
  const tagBadges = (Array.isArray(post.tags) ? post.tags : [])
    .slice(0, 4)
    .map((tag) => `<span class="blog-chip">${escapeHtml(tag)}</span>`)
    .join('');
  const isoDate = toIsoDate(post.date);
  const readTime = estimateReadTimeMinutes(post.body);
  const humanDate = formatDateForHumans(post.date);
  const relatedPosts = renderRelatedPosts(post, posts || []);
  const article = `
    <section class="mt-6 sm:mt-0 blog-hero">
      <div>
        <p class="blog-kicker">Prompt to Profit Insights</p>
        <h1 class="blog-title">${escapeHtml(post.title)}</h1>
        <p class="blog-excerpt">${escapeHtml(post.excerpt || '')}</p>
        <div class="blog-meta">
          <span class="blog-chip">${escapeHtml(humanDate)}</span>
          <span class="blog-chip">${readTime} min read</span>
          ${tagBadges}
        </div>
      </div>
    </section>
    <article class="blog-shell">
      <a href="/blog/" class="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">← Back to blog</a>
      <div class="blog-content mt-7">
        ${injectInArticleCta(markdownToHtml(post.body))}
        ${relatedPosts}
      </div>
    </article>
  `;
  const postImageUrl = getPostImageUrl(post);
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt || '',
    image: postImageUrl,
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
      title: getSeoTitle(post),
      description: post.excerpt,
      canonicalPath: `/blog/${post.slug}/`,
      ogType: 'article',
      ogImage: postImageUrl,
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
      seoTitle: clean(parsed.data.seoTitle) || clean(parsed.data.metaTitle) || '',
      image: clean(parsed.data.image) || clean(parsed.data.heroImage) || '',
      body: parsed.body,
    });
  }

  posts.sort((a, b) => (a.date < b.date ? 1 : -1));
  writeIndex(posts);
  posts.forEach((post) => writePost(post, posts));
  writeRss(posts);
  writeBlogSitemap(posts);
  console.log(`Built blog: ${posts.length} published post(s)`);
}

build();
