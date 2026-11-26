# STJ Staff Reporting Portal v2
Next.js App Router, Neon PostgreSQL, Vercel primary, Netlify optional backup, and Meta WhatsApp Cloud API. Existing responsive forms are served by Next.js; the old Python server and local demo are not runtime dependencies.

## Setup
1. Apply db/001_init.sql to a dedicated Neon database. Configure DATABASE_URL as a server-only secret on each host; use a separate staging database for previews.
2. Run npm install, npm test, npm run build; commit the generated lockfile after review.
3. Create accounts using npm run account:create -- username "Display name" manager (or staff), with STJ_NEW_PASSWORD and DATABASE_URL supplied securely in the shell environment. No default credentials. Keep passwords out of Git. Deactivate accounts by setting active=false.
4. Import the repository into Vercel (Next.js framework) or Netlify (automatic Next.js adapter). Set environment variables directly in the hosting dashboard. Use HTTPS.
5. Configure Meta WhatsApp Business Cloud API: sender phone-number ID, token, recipient in international digits, supported Graph API version, approved five-parameter utility template (type, reference, staff, review instruction, portal URL), language and HTTPS portal URL. Obtain recipient opt-in. No tokens in Git. Test with the approved recipient. API acceptance is not delivery confirmation.

## Release gate
Verify authenticated staff and manager browser journeys, cross-account isolation, malicious input, origin handling behind each proxy, concurrent approvals, database backup/recovery, dependency audit, and actual WhatsApp delivery before sharing with staff. Notification failures do not roll back saved reports. Durable retries, webhook delivery status, account administration UI, attachment uploads and idempotent submission remain pending.
