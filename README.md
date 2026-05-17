# Drivyn AI — Operations Dashboard

Internal client management dashboard for Drivyn AI. Tracks clients, wedge services, API credentials, billing, invoices, and monthly performance reports.

## Structure

```
drivyn-dashboard/
├── index.html              # Main dashboard — entry point
├── assets/
│   ├── css/dashboard.css   # All styles
│   ├── js/dashboard.js     # All logic and state
│   └── img/                # Logo and assets
├── pages/
│   └── report.html         # Standalone client report view (coming)
└── README.md
```

## Deploy via Cloudflare Pages

1. Connect this repo in Cloudflare Pages
2. Build command: leave blank
3. Output directory: `/` (root)
4. Root directory: leave blank
5. Add custom domain: `dashboard.drivynai.com`

## Cloudflare Access (Security)

Add a Cloudflare Access policy to restrict the dashboard to your email only:
- Cloudflare Dashboard → Access → Applications → Add
- Select your Pages URL
- Set allowed email to yours

## Data Storage

Currently uses browser localStorage (Option A). Data persists in the browser you use.

**To upgrade to Airtable backend:** All data is structured and ready to migrate. Contact dev to implement Airtable API integration.

## Features

- Client management with full profile, wedge assignment, and API credentials
- Onboarding progress tracker (5 stages)
- Pilot countdown with conversion reminders
- Client health score (auto-calculated)
- Churn risk detection
- Billing and invoice management with reminders
- Monthly report builder per client (W1, W2, W3)
- Quick wins tracker
- Communication log
- Activity log
- API connection status board
- Revenue recovered tracker

## Wedge Systems

- **W1 — Missed Lead Recovery:** VAPI · GoHighLevel · Make.com · Calendly
- **W2 — Dead Database Reactivation:** GHL · Make.com · Twilio · NeverBounce · Mailgun
- **W3 — Review Gap System:** GHL · Make.com · Twilio · NiceJob / Birdeye

## Contact

GetStarted@getdrivynai.com · (443) 333-9344
