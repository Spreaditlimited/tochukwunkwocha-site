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

## Database Migrations
Run schema migrations outside live traffic:

```bash
npm run db:migrate
```

Runtime DDL is disabled by default for key enrollment/payment paths.  
Only enable runtime schema changes intentionally with:
- `DB_ALLOW_RUNTIME_DDL=1` (or)
- `DB_MIGRATION_MODE=1`

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
- `/.netlify/functions/paystack-reconcile-cron` (scheduled fallback reconciliation)

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
- `FLODESK_ENROL_PROD_SEGMENT_ID` (Prompt to Production enrolment segment; falls back to `FLODESK_ENROL_SEGMENT_ID` if unset)
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
- `DOMAIN_WORST_FX_NGN_PER_USD` (optional profit floor guard; when set, domain checkout subtotal is raised to protect margin at this worst-case FX)
- `DOMAIN_REGISTRAR_COST_USD_PER_YEAR` (default `17.99`; cost basis used with worst-case FX guard)
- `DOMAIN_TARGET_MARGIN_PERCENT` (default `20`)
- `DOMAIN_PAYSTACK_PERCENT` (default `1.5`)
- `DOMAIN_PAYSTACK_FIXED_FEE_NGN` (default `100`)
- `DOMAIN_PAYSTACK_FEE_VAT_PERCENT` (default `7.5`)

Leadpage AI automation
- `LEADPAGE_AUTOMATION_ENABLED` (`1` default; set `0` to disable pre-publish AI content generation)
- `LEADPAGE_AUTOMATION_ALLOW_MOCK` (`1` default; set `0` to require real AI key)
- `LEADPAGE_AI_PROVIDER` (`gemini` default, or `openai`)
- `GEMINI_API_KEY` (or `GOOGLE_AI_API_KEY`) when using Gemini
- `OPENAI_API_KEY` when using OpenAI

Leadpage Brevo automation
- `LEADPAGE_BREVO_ENABLED` (`0` default; set `1` to sync lead-capture clients to Brevo during first publish)
- `LEADPAGE_BREVO_ALLOW_MOCK` (`0` default; set `1` only for non-production mock mode)
- `BREVO_API_KEY` (preferred) or `SENDINBLUE_API_KEY` (legacy alias)
- `BREVO_LEADPAGE_LIST_ID` (required when Brevo is enabled; list where lead-capture clients are added)
- `BREVO_LEADPAGE_FOLLOWUP_EMAIL_COUNT` (`5` default; clamped to 1..7 for free-tier safety)
- `BREVO_FREE_TIER_DAILY_SEND_LIMIT` (`300` default; guardrail blocks new scheduling when projected sends exceed this)

Leadpage customer-owned credentials (new model)
- Netlify publish and Brevo automation now read per-customer credentials saved from the client dashboard.
- Global `NETLIFY_API_TOKEN`/`NETLIFY_SITE_ID` and `BREVO_API_KEY`/`BREVO_LEADPAGE_LIST_ID` are no longer required for leadpage jobs when customer credentials are present.
- First publish is blocked until customer provides:
  - Netlify Site ID
  - Netlify API key
- Brevo automation runs only when customer provides:
  - Brevo API key
  - Brevo List ID

Leadpage build timing (payment-gated)
- No AI page generation runs at detail submission stage.
- Build starts only after payment is confirmed and the client opens their dashboard.
- Dashboard triggers build automatically and shows "We are building your landing page" status while pipeline runs.

Leadpage domain automation (registrar API)
- `LEADPAGE_DOMAIN_AUTOMATION_ENABLED` (`0` default; set `1` to auto-run domain purchase step on first publish for `needs_domain` jobs)
- `LEADPAGE_DOMAIN_PROVIDER` (`namecheap` default, or `resellerclub`, or `mock`)
- `LEADPAGE_DOMAIN_ALLOW_MOCK` (`1` default; set `0` to fail when registrar config is missing)
- `LEADPAGE_DOMAIN_TLDS` (CSV list, default `com,com.ng,ng`)
- `LEADPAGE_DOMAIN_SUGGEST_WINDOW_SECONDS` (default `120`)
- `LEADPAGE_DOMAIN_SUGGEST_LIMIT_PER_WINDOW` (default `8`)
- `LEADPAGE_DOMAIN_CHECK_WINDOW_SECONDS` (default `120`)
- `LEADPAGE_DOMAIN_CHECK_LIMIT_PER_WINDOW` (default `20`)
- `LEADPAGE_DOMAIN_REGISTER_WINDOW_SECONDS` (default `900`)
- `LEADPAGE_DOMAIN_REGISTER_LIMIT_PER_WINDOW` (default `2`)

Namecheap registrar credentials
- `NAMECHEAP_API_USER`
- `NAMECHEAP_API_KEY`
- `NAMECHEAP_USERNAME`
- `NAMECHEAP_CLIENT_IP` (must be allow-listed in Namecheap API settings)
- `NAMECHEAP_USE_SANDBOX` (`1` default for sandbox API, set `0` for production)

Namecheap contact profile (required for registration)
- `NAMECHEAP_CONTACT_FIRST_NAME`
- `NAMECHEAP_CONTACT_LAST_NAME`
- `NAMECHEAP_CONTACT_ADDRESS1`
- `NAMECHEAP_CONTACT_CITY`
- `NAMECHEAP_CONTACT_STATE`
- `NAMECHEAP_CONTACT_POSTAL_CODE`
- `NAMECHEAP_CONTACT_COUNTRY`
- `NAMECHEAP_CONTACT_PHONE`
- `NAMECHEAP_CONTACT_EMAIL`

ResellerClub registrar credentials
- `RESELLERCLUB_RESELLER_ID` (preferred) or `RESCLUB_AUTH_USERID`
- `RESELLERCLUB_API_KEY` (preferred) or `RESCLUB_API_KEY`
- `RESELLERCLUB_USE_TEST` (preferred) or `RESCLUB_USE_TEST` (`1` default; set `0` for production)
- Optional override: `RESELLERCLUB_API_BASE_URL` (or `RESCLUB_API_BASE_URL`)
- Optional: `RESCLUB_DOMAIN_PRODUCT_KEYS_JSON` (JSON map for TLD -> ResellerClub product key, used for pricing lookup, e.g. `{"com":"domcno","net":"domnet"}`)
- Optional proxy mode (use when Netlify egress IP cannot be whitelisted):
  - `RESELLERCLUB_PROXY_BASE_URL` (or `RESCLUB_PROXY_BASE_URL`) - full HTTPS URL of your proxy endpoint
  - `RESELLERCLUB_PROXY_TOKEN` (or `RESCLUB_PROXY_TOKEN`) - optional bearer token used by Netlify when calling proxy

ResellerClub checkout pricing
- Domain checkout amount now comes directly from ResellerClub reseller pricing (`addnewdomain`) per selected TLD and registration years.
- Currency is read from ResellerClub reseller details; domain Paystack checkout is allowed only when that currency resolves to `NGN`.

ResellerClub proxy server (static IP strategy)
- File: `scripts/resellerclub-proxy-server.js`
- Run this on a VPS/server with a static public IP, then whitelist that IP in ResellerClub.
- Required envs on proxy server:
  - `RESCLUB_AUTH_USERID` (or `RESELLERCLUB_RESELLER_ID`)
  - `RESCLUB_API_KEY` (or `RESELLERCLUB_API_KEY`)
  - Optional `RESCLUB_USE_TEST` / `RESELLERCLUB_USE_TEST`
  - Optional `RESCLUB_API_BASE_URL` / `RESELLERCLUB_API_BASE_URL`
  - Optional `RESCLUB_PROXY_TOKEN` (or `PROXY_TOKEN`) for auth between Netlify and proxy

ResellerClub registration defaults
- `RESCLUB_CUSTOMER_ID`
- `RESCLUB_CONTACT_ID` (or set all 4 explicit contact IDs below)
- `RESCLUB_REG_CONTACT_ID` (optional if `RESCLUB_CONTACT_ID` is set)
- `RESCLUB_ADMIN_CONTACT_ID` (optional if `RESCLUB_CONTACT_ID` is set)
- `RESCLUB_TECH_CONTACT_ID` (optional if `RESCLUB_CONTACT_ID` is set)
- `RESCLUB_BILLING_CONTACT_ID` (optional if `RESCLUB_CONTACT_ID` is set)
- `RESCLUB_NS1`
- `RESCLUB_NS2`
- Optional: `RESCLUB_INVOICE_OPTION` (default `KeepInvoice`)
- Optional: `RESCLUB_DISCOUNT_AMOUNT` (default `0.0`)

ResellerClub per-buyer ownership mode (recommended)
- Domain registration now uses runtime buyer-specific customer/contact creation per order (no static ownership fallback).
- Registrant details are collected from the domain checkout form (address, city, state, country, postal code, phone).
- Optional envs:
  - `RESCLUB_CONTACT_COMPANY` (fallback company name)
  - `RESCLUB_CUSTOMER_USERNAME_PREFIX`

## Internal Manual Review Page
Use this URL after deploy:
- `https://tochukwunkwocha.com/internal/manual-payments/`

Workflow:
1. User chooses manual transfer, uploads proof, and is added to pre-enrol segment.
2. You verify payment in your bank app.
3. Approve in internal page.
4. User is synced to main enrolment Flodesk segment.
