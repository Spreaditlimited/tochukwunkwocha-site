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
This site now uses checkout + webhook functions:
- `/.netlify/functions/create-order`
- `/.netlify/functions/paystack-webhook`
- `/.netlify/functions/paypal-webhook`
- `/.netlify/functions/paypal-return`

To make this work in production:
1. Add environment variables:
   - `DB_HOST`
   - `DB_USER`
   - `DB_PASSWORD`
   - `DB_NAME`
   - `SITE_BASE_URL` (for example `https://tochukwunkwocha.com`)
   - `PAYSTACK_SECRET_KEY`
   - `PAYPAL_CLIENT_ID`
   - `PAYPAL_CLIENT_SECRET`
   - `PAYPAL_WEBHOOK_ID`
   - `FLODESK_API_KEY`
   - `FLODESK_ENROL_SEGMENT_ID`
2. Optional pricing vars:
   - `PROMPT_TO_PROFIT_PRICE_NGN_MINOR` (default `5000000`)
   - `PROMPT_TO_PROFIT_PRICE_USD` (default `99.00`)
3. In Paystack dashboard, set webhook URL:
   - `https://tochukwunkwocha.com/.netlify/functions/paystack-webhook`
4. In PayPal dashboard, set webhook URL:
   - `https://tochukwunkwocha.com/.netlify/functions/paypal-webhook`

## After Deploy
- Keep Selar courses as external links only.
