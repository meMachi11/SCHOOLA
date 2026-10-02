# Virtual school dataset

The site enables `SCOLA_DEMO_DATA=enabled`. On the next administrator snapshot, Scola loads fictional records once. Administrators can also use **Paramètres → École virtuelle → Charger les exemples**. Existing records and later edits are preserved; repeated loading does not restore or duplicate examples.

The connected dataset includes one school year, two levels/classes, three subjects, eight students (including an archived profile), two teachers, four parents, two student accounts and one fictional administrator. It includes seven days of attendance, four homework assignments, four assessments with sixteen grades, two fee schedules, sixteen invoices and six payments in MAD, three calendar events, three announcements and three downloadable sample PDFs. Each real administrator receives a sample conversation and six in-app notifications.

A banner, record badges and print labels identify the examples. Fictional account names start with `[Démo]`, use reserved `.test` email addresses and start without passwords or linked identities. Four reserved examples can be activated for password sign-in through the explicitly configured secret `SCOLA_DEMO_LOGIN_HASHES`; the remaining accounts are relationship fixtures. This setting holds salted password hashes, never plaintext passwords.

Sample notifications are inserted locally. Changes to demo records, demo fee reminders, password recovery for fictional accounts and pushes to fictional users do not send external messages. Real records continue using the normal notification rules. Auth, password-reset delivery and device push still require real account/provider/device configuration; fixtures do not verify those external services.

Demo attendance, grades and scheduled invoices use the same canonical IDs as normal edits. The demo marker survives edits and propagates to related records, including new payments. Dates are relative to the initial load; subsequent loading preserves the existing dates and read states. Examples use the same backend and offline cache as ordinary records and contribute to dashboard/report totals.

## Local verification

Use a disposable local D1/R2 state, apply the existing migrations in order, then start a freshly built preview on port 4173 with `SCOLA_OWNER_EMAIL=owner@example.test` and `SCOLA_DEMO_DATA=enabled`.

```sh
npm run verify:demo
```

The script checks every record type, relationships, PDF downloads, fee consistency, edit preservation, permission checks, repeated loading, and notification isolation. It refuses non-local URLs and writes test fixtures. Use a fresh database for each run.
