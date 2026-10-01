# School API

All responses containing school data use `Cache-Control: private, no-store`. APIs accept the application session cookie or `Authorization: Bearer <token>` from a password login. Hosted ChatGPT identities must already be assigned a school account (except the configured owner bootstrap). The Site's access policy applies before these endpoints.

| Endpoint         | Methods           | Purpose                                                                                                   |
| ---------------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| `/api/auth`      | GET, POST         | Current identity, login/logout, password changes, recovery/reset                                          |
| `/api/school`    | GET               | Authorized records, user directory, notifications, file metadata, settings and administrator audit events |
| `/api/school`    | POST              | Save a module record, edit users/settings, connect/test email, read notifications, send fee reminders     |
| `/api/school`    | DELETE            | Administrator soft deletion of unused non-financial records                                               |
| `/api/students`  | GET               | Authorized student records; legacy writes return 410                                                      |
| `/api/documents` | GET, POST, DELETE | Authorized attachment listing/download, multipart upload and deletion                                     |
| `/api/push`      | GET, POST, DELETE | VAPID public key, register/test subscriptions, unregister account devices                                 |

Create/update records with `{id, kind, data, version, mutationId}`. Create with `version: 0`; updates must use the most recently read version. `mutationId` is a unique UUID for an operation and must be reused on retry. A stale version returns 409. Attendance is unique per student/date/session; grades are unique per student/assessment; scheduled invoices are unique per schedule/student. Server validation is defined in `lib/school/model.ts` and permissions in `lib/school/policy.ts`.

Amounts are integer centimes (10000 means MAD 100). Assessments define the maximum and coefficient. Report averages normalize each score to 20, weight assessments within a subject, then weight subjects by their subject coefficients. Missing grades do not become zero.

Attachments use multipart fields `record` and `file`. Only non-empty PDF/JPEG/PNG files with matching signatures are accepted (5 MiB; 10 per record). Download with `GET /api/documents?id=<id>`. Files inherit the record's permissions. Parents may add documents only to their own linked student profiles.

Errors use `{error: string}` with 400 for invalid data, 401 for missing identity, 403 for authorization, 404 for missing files/records, 409 for conflicts, 413 for oversized requests, 429 for rate limits and 503 for unavailable dependencies. Never cache another user's snapshot or log tokens/passwords/API keys.
