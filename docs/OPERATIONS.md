# Scola operations

Scola is a French/Arabic school workspace. It uses Cloudflare D1 for school records, users, sessions, audit events and notification metadata, and R2 for attachments. The same authenticated JSON API serves the web application and PWA/mobile clients.

## First administrator and access

Set `SCOLA_OWNER_EMAIL` to the verified Site owner's email, then sign in with ChatGPT. Only that identity can bootstrap the first administrator. Every additional user needs an account created by an administrator. User roles and class/student assignments are checked on the server; disabling an account revokes both password and ChatGPT access. The owner cannot lose administrator access.

The existing Site audience remains unchanged. Application roles do not automatically grant access through the Site's workspace sharing boundary. Add parents/teachers to Site sharing as appropriate before they can reach its login screen.

Set `SCOLA_ORIGIN` to the canonical Site URL. Use `SCOLA_CONFIG_KEY`, a random 32-byte base64url secret stored in Sites runtime secrets, to encrypt email-service credentials. Never commit credentials or supply them in command arguments.

## School setup

1. Configure school years, levels, subjects and classes in Administration.
2. Create teacher accounts and assign their classes.
3. Create student profiles with their class and school year.
4. Create parent/student accounts and assign the student profiles they may access. Parent links and teacher/class assignments stay synchronized between the user editor and record editors.
5. Record attendance by day/session, post homework and attach PDFs/images, create assessments, and enter grades.
6. Set fee schedules, generate student invoices, and record payments in MAD. Payments are immutable; concurrent payments cannot exceed an invoice balance. Print a payment record to create a receipt.

Existing student profiles and documents are imported once when the administrator opens the upgraded application. Legacy guardian contact details are preserved in the imported record; create parent accounts to give those guardians access. Existing migrations are preserved; `0001_public_sentry.sql` adds the new tables.

## Communication

Parents receive notifications for absence/late status, homework, grades, announcements, messages and payments. Enable push per device in Notifications. Browsers must grant permission; on iOS, install the PWA on the home screen first. Notifications use RFC 8291 payload encryption and VAPID authentication. Expired subscriptions are removed; delivery still depends on the browser push provider and device connectivity. In-app notifications remain available if push delivery fails.

Administrators send overdue-fee reminders from Scolarité & paiements. Reminders are deduplicated per invoice, recipient and day. No unattended nightly scheduler is configured. Announcements with future publication dates become visible on that date; publish on the current date for immediate push notification.

Messaging is limited to authorized school/family relationships. Parents and students cannot message unrelated families. Administrators oversee school records; teacher access is restricted to assigned classes.

## Password recovery

Open Settings → Emails de récupération. Select Resend, Brevo or Mailgun; provide a verified sender and the provider's API key, then send a test email. API keys are encrypted in D1 with the runtime secret and are never returned to the browser. `contact@schoolapp.space` is prefilled; it must be verified by the selected provider. Mailgun additionally needs its sending domain. Until a provider is connected, the app clearly reports that email recovery is unavailable.

Password sessions expire after seven days. Password changes/reset revoke existing sessions. Reset links are one-use and expire after 30 minutes. Login attempts are limited, session cookies are HttpOnly/SameSite and Secure on HTTPS, and mutations reject cross-site browser requests. Security events are visible to administrators.

## Offline/PWA

Install through your browser's normal install/Add to Home Screen flow. The service worker caches public application assets, never authenticated API responses. School data caching is opt-in in Synchronisation, scoped to the current account and expires after 24 hours. Use it only on private devices.

Supported record edits are queued in IndexedDB and submitted when the app is open and connectivity returns. Synchronization uses mutation IDs and optimistic record versions. Conflicting edits stay in the queue for review; they never silently replace a changed server record. Payments, invoices, fee schedules, accounts and uploads need a live connection. Logout clears local school data and unregisters push for the current device. Closing the PWA may postpone sync until it is reopened.

## Verification

Dependencies are managed with the existing pnpm lockfile. Node 22.13+ is required.

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `node scripts/verify-grades.mjs`
- `node scripts/verify-push.mjs`
- `node scripts/verify-school.mjs http://127.0.0.1:4173 owner@example.test`

The API verification script writes fixtures and is restricted to loopback hosts. Use a disposable local database and start Wrangler with `--var SCOLA_OWNER_EMAIL:owner@example.test`. It verifies every module, authorization, overpayment/concurrency, mutation retries, stale-version conflicts, notifications, attachments and session revocation. Never run fixture verification against production.
