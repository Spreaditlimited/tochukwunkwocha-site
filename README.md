# TochukwuNkwocha.com Website

Static multi-page site with no build tools and no npm install.

## Structure
- `/index.html` (Home)
- `/courses/index.html` (Courses)
- `/courses/prompt-to-profit/index.html` (Prompt to Profit)
- `/assets/styles.css`
- `/assets/site.js`
- `/assets/tochukwu.jpg`
- `/assets/favicon.svg`

## Local Preview
```bash
cd /Users/tochukwunkwocha/projects/linescout/marketing-site/tochukwunkwocha
python3 -m http.server 8080
```
Open `http://localhost:8080`.

## Deploy
1. Connect this folder to Netlify using Git or Netlify CLI deploy.
2. Add custom domain in Netlify: `tochukwunkwocha.com`.
3. Update nameservers at Hosting.com to Netlify nameservers.

## Enrol modal + Flodesk
This site now uses a Netlify Function at `/.netlify/functions/flodesk-subscribe`.

To make this work in production:
1. In Netlify site settings, add environment variable `FLODESK_API_KEY`.
2. Optional: add `FLODESK_TOCHUKWU_SEGMENT_ID` (defaults to `69ad60e952e4ac8ca746bb53`).
3. Deploy from Git or use Netlify CLI deploy so the function is included.

## After Deploy
- Keep Selar courses as external links only.
