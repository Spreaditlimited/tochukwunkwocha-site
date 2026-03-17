# TochukwuNkwocha.com Website

Static multi-page site with Netlify Functions for course payments and enrolment sync.

## Structure
- `/index.html` (Home)
- `/courses/index.html` (Courses)
- `/courses/prompt-to-profit/index.html` (Prompt to Profit)
- `/assets/styles.css`
- `/assets/site.js`
- `/assets/admin-manual-payments.js`
- `/internal/manual-payments/index.html` (lightweight internal payment review page)
- `/netlify/functions/*`

## Local Preview
```bash
cd /Users/tochukwunkwocha/projects/tochukwunkwocha-site
python3 -m http.server 8080
```
Open `http://localhost:8080`.

## Deploy
1. Connect this folder to Netlify using Git or Netlify CLI deploy.
2. Add custom domain in Netlify: `tochukwunkwocha.com`.
3. Update nameservers at Hosting.com to Netlify nameservers.

## Payment Functions
Current payment flow uses these functions:
- `/.netlify/functions/create-order`
- `/.netlify/functions/paystack-webhook`
- `/.netlify/functions/paypal-webhook`
- `/.netlify/functions/paystack-return`
- `/.netlify/functions/paypal-return`
- `/.netlify/functions/order-summary`

Manual transfer flow uses:
- `/.netlify/functions/manual-payment-config`
- `/.netlify/functions/upload-signature`
- `/.netlify/functions/manual-payment-submit`
- `/.netlify/functions/admin-login`
- `/.netlify/functions/admin-logout`
- `/.netlify/functions/admin-manual-payments-list`
- `/.netlify/functions/admin-manual-payments-review`

## Environment Variables
Set these in Netlify:

Core DB / payment / Flodesk
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
- `FLODESK_ENROL_SEGMENT_ID` (main enrolment segment, default `69ad9a50568c36094377ea96`)
- `FLODESK_PRE_ENROL_SEGMENT_ID` (pre-enrolment segment, default `69ad60e952e4ac8ca746bb53`)

Manual transfer bank details
- `MANUAL_BANK_NAME`
- `MANUAL_BANK_ACCOUNT_NAME`
- `MANUAL_BANK_ACCOUNT_NUMBER`
- `MANUAL_BANK_NOTE` (optional)

Manual transfer proof upload (Cloudinary)
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Lightweight internal dashboard auth
- `ADMIN_DASHBOARD_PASSWORD`
- `ADMIN_SESSION_SECRET`

Optional pricing vars
- `PROMPT_TO_PROFIT_PRICE_NGN_MINOR` (default `1075000` = N10,750)
- `PROMPT_TO_PROFIT_PRICE_GBP` (default `24.00`)

## Internal Manual Review Page
Use this URL after deploy:
- `https://tochukwunkwocha.com/internal/manual-payments/`

Workflow:
1. Student chooses manual transfer, uploads proof, and is added to pre-enrol segment.
2. You verify payment in your bank app.
3. Approve in internal page.
4. Student is synced to main enrolment Flodesk segment.
