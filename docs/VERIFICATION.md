# Scola verification — 1 October 2026

The current school workspace was checked against a disposable local D1 database and R2 bucket, using the production Worker build. Existing students, two school years and a PDF were seeded before the upgrade check. Test records were never written to production.

## Results

| Area | Checks | Result |
| --- | --- | --- |
| Build and static checks | Production build, TypeScript, ESLint, Git whitespace validation | Passed |
| Students | Create through UI/API, class/year references, guardian accounts, private notes, legacy contacts and archived profiles | Passed |
| Administration | Classes, levels, subjects, teachers, school years and calendar; actual form submissions | Passed |
| Attendance | Daily/session records, absence notices, assigned-class restrictions, bulk present action | Passed |
| Homework | Instructions, deadlines, teacher permissions, parent visibility, PDF upload | Passed |
| Grades | Assessment maximums, score limits, weighted normalization to 20, subject coefficients, term separation, report printing | Passed |
| Fees | MAD converted to integer centimes, schedules/invoices/payments, balances, idempotent retry, concurrent overpayment rejection, immutable payments and receipt printing | Passed |
| Notifications | In-app events, unread/read state, fee reminder endpoint, invalid push endpoint rejection, VAPID keys, independently decrypted RFC 8291 payload | Passed locally; device delivery pending |
| Announcements | Targeted class/role records and actual posting form | Passed |
| Messaging | Parent/teacher conversations, unrelated-recipient rejection, UI send flow, account privacy | Passed |
| Files | D1 metadata/R2 download, permission checks, file signature/type/size rejection, original document preservation | Passed |
| Dashboard | Rendering and navigation for all four roles, no browser runtime errors | Passed |
| Users and permissions | Admin/teacher/parent/student sessions, hidden admin controls, class/family isolation, protected first administrator, account deactivation | Passed |
| Authentication | Password login/change/logout, session revocation, cookie flags, failed-login rate limit, successful/expired/weak/replayed/concurrent reset tokens, audit events, cross-site rejection | Passed locally |
| French and Arabic | Desktop/mobile rendering, RTL, navigation, accessible form labels and keyboard dialog closure, no horizontal overflow at tested widths | Passed |
| PWA/mobile API | Manifest/icons/service worker, authenticated JSON/bearer access, cached shell reload | Passed locally; physical-device installation pending |
| Offline | Explicit opt-in cache, queued edits, reconnect persistence, stale-edit conflict retained without overwriting server data, explicit review/reapply, queue removal and cache clearing on opt-out | Passed |
| Upgrade | Original student IDs, separate school years/classes, archived status, guardian contacts through edits, document metadata and PDF download | Passed |
| Email integration | AES-GCM credential round-trip, invalid/missing configuration, mocked Resend/Brevo/Mailgun payloads and provider rejection | Passed with HTTP mocks; actual delivery pending |
| Request validation | Non-object JSON rejection, malformed/empty input, multilingual JSON, exact 65,536-byte boundary, bounded/cancelled chunked input | Passed |

## Findings corrected

JSON `null` requests previously produced a 503 response. Authentication and school mutations now require a JSON object and return 400 for null, arrays and primitives. The request reader now enforces its limit against actual UTF-8 bytes while streaming, cancels oversized input and avoids reading an unlimited chunked body into memory. Regression coverage was added in `scripts/verify-school.mjs` and `scripts/verify-requests.mjs`.

## Production checks

Read-only Sites checks confirmed the successful deployment, the DB binding and all 13 expected user tables, an active owner administrator with a linked identity, and the owner/origin/encryption runtime settings. The inspected recent log window contained unauthorized 401 responses from deployment smoke requests, with no Worker crash or 5xx events in that window. These checks are evidence of deployment/schema readiness, not a complete live acceptance test for every role.

## Verification limits

- Real password-reset delivery remains unverified until an email provider/API key and verified sender are connected. Provider tests used mocked HTTP responses. Successful reset-token consumption and session revocation were tested against the local database.
- Real push delivery and iOS/Android installation require a physical device, browser permission and a subscription. Payload encryption and API behavior were tested; no device notification was sent.
- The local Wrangler preview proxy intermittently returns its own “worker restarted mid-request” 503 for rapidly consecutive requests after an oversized upload. Independently issued ASCII/Arabic oversized requests returned 413, and the bounded-reader tests passed. Burst/aborted-upload behavior in production remains unverified. The preview proxy error is recorded rather than counted as a passing test.
- Cloud-environment network policy blocked direct live-site HTTP/browser testing. Production inspection used native read-only Sites tools. Browser tests ran locally in Chromium; Safari/Firefox and physical devices were not covered.
- Fee reminders are manually triggered. Future-dated announcements become visible on their date; unattended scheduled pushes are not configured.

## Repeatable checks

```sh
npm run typecheck
npm run lint
npm run verify:grades
npm run verify:push
npm run verify:requests
npm run build
node scripts/verify-school.mjs http://127.0.0.1:4173 owner@example.test
```

Run the API script only against a disposable local database with `SCOLA_OWNER_EMAIL=owner@example.test`; it creates test records. Apply migrations once in order. Start a fresh Wrangler preview after rebuilding. Additional browser, offline/conflict, legacy-upgrade, reset-token and mocked-email harnesses were executed for this verification; their environment-specific files are under `/tmp/schoola-tests-*.mjs` in this execution workspace. Print screenshots are in `outputs/test-report-print.png` and `outputs/test-receipt-print.png`.

This report records the checks performed and their limits; it is not a guarantee that every possible input, browser or device will work.

## Virtual dataset verification — 2026-10-02

Passed typecheck, lint, production build, grade weighting, Web Push encryption and bounded-request tests. The new local `verify:demo` integration check passed for all 15 record types, eight student profiles, nine fictional accounts, three PDF downloads, relationship integrity, fee balances, canonical edits, demo-marker propagation, repeated loading, real-data preservation, admin-only loading and suppression of real-parent notices/demo reminders. The existing school API regression script also passed against the same disposable state (using the demo test owner's identity).

Chromium checks passed for every navigation screen in French and Arabic, the demo banner and record badges, printed fictional-data label, RTL and a 390px mobile viewport, without browser exceptions. Independent `pdfinfo`/`pdftotext` parsing confirmed the sample homework PDF is a valid one-page PDF and includes the fictional-data notice. No real email or device push was sent. The production dataset is initialized on the next signed-in administrator snapshot after publication; local results do not constitute a live external-service test.

## Four access areas — 2026-10-02

Passed typecheck, lint, production build and the existing school API regression. The new `verify:access` check used individual teacher, parent and student accounts against the connected demo data. It verified server-assigned roles despite a client requesting admin, assigned-class boundaries, student/parent record isolation, finance visibility, admin-only changes and rejection of a student linked to multiple profiles. Grade, push-encryption and bounded-request checks also passed.

Chromium checks passed for all four authenticated areas, role-specific menus, parent/student read-only controls, the administrator's four sign-in links, French/Arabic and a 390px mobile viewport. Selecting the administrator sign-in area with a student account still opened the student area. No browser exceptions were observed. Existing Sites workspace/visitor access remains unchanged; school accounts do not by themselves grant access through that platform boundary.
