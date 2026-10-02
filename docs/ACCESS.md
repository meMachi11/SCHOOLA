# Four school access areas

Each person has their own account, assigned by an administrator under **Utilisateurs & accès → Créer un compte**. Choose their role, set an initial password, then associate teachers with their classes, parents with their children, or students with a single student profile. The active account's saved role determines permissions; selecting a sign-in area never grants additional access.

| Role          | Sign-in link                                                   | Scope                                                                                                                |
| ------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Administrator | https://scola-school.myspace-5793.chatgpt.site/?access=admin   | All school records, users, administration, fees and settings                                                         |
| Teacher       | https://scola-school.myspace-5793.chatgpt.site/?access=teacher | Assigned classes; attendance, homework, assessments, grades and class announcements; relevant messages and documents |
| Parent        | https://scola-school.myspace-5793.chatgpt.site/?access=parent  | Linked children; attendance, homework, results, invoices/receipts, relevant announcements and messages               |
| Student       | https://scola-school.myspace-5793.chatgpt.site/?access=student | Own profile, attendance, homework, results, relevant announcements, documents and messages; no finance access        |

Administrators alone create or change roles. A student account may be associated with at most one profile. Unlinked parent/student accounts cannot view student records; teachers without class assignments cannot view or change class records. Role edits revoke existing app sessions. Server checks protect API requests and document access independently of navigation. Existing site visitor restrictions still apply before app login; a school account does not change Sites workspace/visitor membership.

Demo accounts remain fictional records without passwords. Create individual accounts for real people; never share the administrator login.

For repeatable checks, enable the virtual dataset in a disposable local database, configure `SCOLA_OWNER_EMAIL=owner@example.test`, start the built preview at localhost:4173 and run `node scripts/verify-access.mjs`. The test creates local accounts and refuses non-local targets.
