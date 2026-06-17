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
<section class="my-10 sm:my-12 rounded-2xl border border-white/10 bg-[#0d1117]/80 p-5 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.35)]">
  <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <p class="!mt-0 text-[11px] font-extrabold uppercase tracking-[0.16em] text-brand-300">Build Practical AI Skills</p>
      <h3 class="mt-2 text-xl sm:text-2xl font-heading font-extrabold text-white">Ready to move from reading to building?</h3>
      <p class="!mt-2 text-slate-400 leading-relaxed">Explore our hands-on AI courses for schools, kids, and ambitious creators.</p>
    </div>
    <a href="/courses/" style="text-decoration:none;" class="inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-brand-600 to-purple-600 px-5 py-3 text-sm font-bold !text-white shadow-[0_0_25px_rgba(102,126,178,0.35)] transition hover:from-brand-500 hover:to-purple-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
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
    <section class="mt-12 border-t border-white/10 pt-8">
      <p class="text-xs font-bold uppercase tracking-[0.16em] text-brand-300">Related articles</p>
      <div class="mt-5 grid gap-4">
        ${related.map((item) => `
          <a href="/blog/${item.slug}/" class="group block rounded-xl border border-white/10 bg-white/5 p-4 no-underline transition hover:border-brand-400/50 hover:bg-white/10">
            <p class="!mt-0 font-heading text-lg font-bold leading-snug text-white group-hover:text-brand-300">${escapeHtml(item.title)}</p>
            <p class="!mt-2 text-sm leading-relaxed text-slate-400">${escapeHtml(item.excerpt || '')}</p>
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
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Manrope:wght@700;800&family=Fira+Code:wght@400;500;600&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/assets/styles.css" />
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = {
        theme: {
          extend: {
            fontFamily: { sans: ["Inter", "sans-serif"], heading: ["Manrope", "sans-serif"], mono: ["Fira Code", "monospace"] },
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
      .ambient-glow-1 {
        position: absolute;
        top: -5%;
        left: -10%;
        width: 60%;
        height: 50%;
        background: rgba(37, 99, 235, 0.15);
        border-radius: 50%;
        filter: blur(150px);
        pointer-events: none;
        z-index: 0;
      }
      .ambient-glow-2 {
        position: absolute;
        bottom: -10%;
        right: -10%;
        width: 50%;
        height: 60%;
        background: rgba(124, 58, 237, 0.1);
        border-radius: 50%;
        filter: blur(150px);
        pointer-events: none;
        z-index: 0;
      }
      .tech-grid {
        position: absolute;
        inset: 0;
        background-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PGNpcmNsZSBjeD0iMjMiIGN5PSIyMyIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjAyKSIvPjwvc3ZnPg==');
        z-index: 0;
        pointer-events: none;
      }
      .blog-hero {
        position: relative;
      }
      .blog-hero-grid {
        display: none;
      }
      .blog-title {
        margin-top: 0;
        max-width: 920px;
        font-family: "Manrope", sans-serif;
        font-size: clamp(2.25rem, 5vw, 4.5rem);
        line-height: 1.15;
        color: #ffffff;
        font-weight: 800;
        letter-spacing: -0.02em;
      }
      .blog-excerpt {
        margin-top: 1.5rem;
        max-width: 800px;
        color: #94a3b8;
        font-size: clamp(1.1rem, 2vw, 1.25rem);
        line-height: 1.75;
        font-weight: 300;
      }
      .blog-meta {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 1rem;
      }
      .blog-chip {
        display: inline-flex;
        align-items: center;
        border-radius: 0.5rem;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        padding: 0.35rem 0.85rem;
        font-family: "Fira Code", monospace;
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.05em;
        color: #cbd5e1;
        text-transform: uppercase;
      }
      .blog-shell {
        background: transparent;
        border: none;
        padding: 0;
      }
      .blog-content {
        max-width: 720px;
        margin-inline: auto;
        font-family: "Inter", sans-serif;
      }
      .blog-content p {
        margin-top: 1.75rem;
        color: #cbd5e1;
        font-size: 1.125rem;
        line-height: 1.95;
        font-weight: 300;
      }
      .blog-content > p:first-of-type::first-letter {
        font-family: "Manrope", sans-serif;
        font-weight: 800;
        font-size: 4.5rem;
        float: left;
        line-height: 0.85;
        margin-top: 0.2rem;
        margin-right: 1rem;
        color: #60a5fa;
        text-shadow: 0 0 25px rgba(96, 165, 250, 0.5);
      }
      .blog-content h1,
      .blog-content h2,
      .blog-content h3,
      .blog-content h4 {
        font-family: "Manrope", sans-serif;
        color: #ffffff;
        line-height: 1.3;
        font-weight: 800;
        letter-spacing: -0.01em;
      }
      .blog-content h2 {
        margin-top: 4rem;
        font-size: clamp(1.75rem, 4vw, 2.25rem);
        padding-bottom: 0.75rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      }
      .blog-content h3 {
        margin-top: 2.5rem;
        font-size: 1.5rem;
      }
      .blog-content ul,
      .blog-content ol {
        margin-top: 1.5rem;
        padding-left: 1.5rem;
      }
      .blog-content ul {
        list-style-type: none;
      }
      .blog-content li {
        position: relative;
        margin-top: 0.85rem;
        color: #cbd5e1;
        line-height: 1.8;
        font-weight: 300;
      }
      .blog-content ul li::before {
        content: '';
        position: absolute;
        left: -1.5rem;
        top: 0.65rem;
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #c084fc;
        box-shadow: 0 0 10px rgba(192, 132, 252, 0.6);
      }
      .blog-content a {
        color: #60a5fa;
        font-weight: 500;
        text-decoration: none;
        border-bottom: 1px solid rgba(96, 165, 250, 0.3);
        transition: all 0.3s ease;
      }
      .blog-content a:hover {
        color: #93c5fd;
        border-bottom-color: #93c5fd;
        text-shadow: 0 0 10px rgba(147, 197, 253, 0.4);
      }
      .blog-content code {
        background: rgba(13, 17, 23, 0.8);
        border: 1px solid rgba(255, 255, 255, 0.1);
        padding: 0.2rem 0.4rem;
        border-radius: 0.4rem;
        font-family: "Fira Code", monospace;
        font-size: 0.85em;
        color: #a5d6ff;
      }
      .blog-content pre {
        background: #0d1117;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 1rem;
        padding: 1.5rem;
        overflow-x: auto;
        margin-top: 2rem;
        box-shadow: inset 0 2px 10px rgba(0,0,0,0.5);
      }
      .blog-content pre code {
        background: transparent;
        border: none;
        padding: 0;
        color: #e2e8f0;
      }
      .blog-content strong {
        color: #ffffff;
        font-weight: 600;
      }
      .blog-content blockquote {
        margin-top: 2rem;
        padding: 1.5rem 2rem;
        border-left: 4px solid #c084fc;
        background: linear-gradient(to right, rgba(192, 132, 252, 0.1), transparent);
        border-radius: 0 1rem 1rem 0;
        font-style: italic;
        color: #e2e8f0;
      }
      @media (max-width: 640px) {
        .blog-content > p:first-of-type::first-letter {
          font-size: 3.5rem;
        }
        .blog-content p {
          font-size: 1.05rem;
          line-height: 1.85;
        }
      }
    </style>
  </head>
  <body class="bg-[#060b14] text-slate-300 font-sans antialiased min-h-screen flex flex-col selection:bg-brand-500 selection:text-white">
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
              <a href="/dashboard/login/">Individual</a>
            </div>
          </div>
        </nav>
      </div>
    </header>
    <main class="blog-post-main flex-1 w-full relative overflow-hidden bg-[#060b14] text-slate-300 pt-16 pb-20 sm:pt-24 sm:pb-32">
      <div class="ambient-glow-1"></div>
      <div class="ambient-glow-2"></div>
      <div class="tech-grid"></div>
      <div class="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
      ${body}
      </div>
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
    <section class="mt-6 sm:mt-0 blog-hero relative z-10 group perspective-1000">
      <div class="absolute -inset-0.5 bg-gradient-to-br from-brand-400 to-purple-600 rounded-[2.5rem] opacity-30 group-hover:opacity-50 transition-opacity duration-700 blur-2xl -z-10"></div>
      <div class="relative bg-[#0d1117]/80 backdrop-blur-2xl border border-white/10 p-8 sm:p-12 lg:p-16 rounded-[2.5rem] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] overflow-hidden">
        <div class="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-brand-400 via-purple-500 to-brand-600"></div>
        
        <div class="absolute -right-20 -top-20 w-64 h-64 bg-brand-500/10 rounded-full blur-[80px] pointer-events-none"></div>

        <div class="inline-flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 text-brand-300 font-mono font-bold text-[10px] uppercase tracking-widest rounded-full mb-6">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9.5a2.5 2.5 0 00-2.5-2.5H15M9 11l3 3L22 4"></path></svg>
          Prompt to Profit Insights
        </div>
        
        <h1 class="blog-title">${escapeHtml(post.title)}</h1>
        <p class="blog-excerpt">${escapeHtml(post.excerpt || '')}</p>
        
        <div class="blog-meta mt-10 pt-6 border-t border-white/10">
          <span class="blog-chip">
            <svg class="w-3.5 h-3.5 mr-1.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            ${escapeHtml(humanDate)}
          </span>
          <span class="blog-chip">
            <svg class="w-3.5 h-3.5 mr-1.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            ${readTime} min read
          </span>
          ${tagBadges}
        </div>
      </div>
    </section>

    <article class="blog-shell relative z-10 max-w-4xl mx-auto mt-12 sm:mt-16">
      <a href="/blog/" class="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-slate-400 hover:bg-white/10 hover:text-white transition-all duration-300 group/link">
        <svg class="w-4 h-4 transform group-hover/link:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
        Back to Insights
      </a>
      <div class="blog-content mt-10 sm:mt-12">
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
