# STJ Family Home — Staff Reporting Portal (starter)

## Preview
Open `index.html` directly in a browser. Demo mode allows sample reports, local history, manager-view simulation, and a WhatsApp prefilled message link. Use test data only. Press Send inside WhatsApp to actually send a demo message; the demo does not claim delivery.

## Local backend
Requires Python 3.10+ (no third-party packages). Run `python server.py hash-password` for each account to generate a salted password hash. Set environment variables (examples below for a Unix shell; Windows users can use PowerShell `$env:NAME='value'`). Do not put real secrets in source files.

```
export STJ_SESSION_SECRET='REPLACE-WITH-A-RANDOM-SECRET-AT-LEAST-32-CHARACTERS'
export STJ_ACCOUNTS_JSON='{"manager":{"name":"Operations Manager","role":"manager","password_hash":"REPLACE"},"staff1":{"name":"Staff Member","role":"staff","password_hash":"REPLACE"}}'
export STJ_INSECURE_LOCAL=1
python server.py
```
Visit http://127.0.0.1:8000. SQLite saves submissions on disk; staff can see only their submissions, managers can view all and decide requisitions. Database path defaults to `stj.sqlite3` in the app folder. For deployment, use a persistent disk, HTTPS reverse proxy, remove `STJ_INSECURE_LOCAL`, configure login rate limiting at the proxy, monitoring, backups and a production-grade web server. This is a prototype backend, not a Vercel serverless deployment or a production security certification. The demo flag is a local simulation and does not grant backend access.

## Automatic WhatsApp notification
Register a WhatsApp Business Platform sender and configure the manager's receiving number. Obtain an appropriate access token, phone number ID, and approved template. Use a different receiving number from the sender. Approve this example body template in Meta (exact category, language, and template approval determined by Meta):

```
STJ Family Home has a new staff submission.
Type: {{1}}
Reference: {{2}}
Submitted by: {{3}}
Summary: {{4}}
Open the reporting portal: {{5}}
```

Set `WA_ACCESS_TOKEN`, `WA_PHONE_NUMBER_ID`, `WA_RECIPIENT` (international digits), `WA_TEMPLATE`, `WA_GRAPH_VERSION` (supported version, e.g. vXX.X as selected in Meta), `WA_LANGUAGE` (default en_US), `STJ_PUBLIC_URL` (HTTPS URL of your portal). Keep all credentials server-side. The server saves each report before attempting notification. An accepted response means Meta accepted the request, not that the manager received it. Missing configuration, failed sends and unconfirmed sends are explicitly recorded; webhooks, retry queues, delivery receipts, file uploads, and production deployment are not yet implemented. Manager approval is in the authenticated portal, not inside WhatsApp. A summary and portal URL are sent, rather than exposing full report details through WhatsApp. Do not enter guest names or sensitive personal details in free-text fields.

## Before staff rollout
Confirm form headings and required fields; configure real staff accounts, approved WhatsApp template and secure hosting; test a real end-to-end message and role permissions; implement throttling, idempotency, notification retries/webhooks, backup/restore and attachments if required.
