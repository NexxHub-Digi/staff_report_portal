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

## Manager activation and staff roster
Reserved inactive accounts must be activated using the account:create command with a privately chosen password. The manager can subsequently activate reserved staff or create additional staff via Staff accounts. Do not create a second manager using the browser. Confirm staff roster and operational fields before release.

### Multiple WhatsApp recipients
Apply db/002_notification_results.sql before deploying. Set WA_RECIPIENTS to comma-separated international numbers as a server-only environment variable. Each distinct recipient is sent one template request. Per-recipient API acceptance is recorded by recipient slot and provider message ID; phone numbers are not included in report records. Delivery confirmation webhooks and durable retries remain pending. Set WA_TEMPLATE only to an approved Meta template.

### First-time manager activation (browser)
Generate a random 32-byte setup code locally, retain it privately, and set its SHA-256 hex digest as sensitive `STJ_MANAGER_SETUP_TOKEN_HASH` in the relevant host environment. Example: `node -e "const c=require('node:crypto'); const t=c.randomBytes(32).toString('hex'); console.log('Private setup code: '+t); console.log('SHA-256 hash: '+c.createHash('sha256').update(t).digest('hex'))"`. Never paste the code in chat, Git, or a URL. Redeploy, open First-time manager activation on the sign-in page, and enter the code and a password of at least 14 characters. Activation atomically updates only the reserved inactive manager. Remove the setup hash after success. Production and staging must have distinct codes and databases. Do not enable live WhatsApp in acceptance previews.
