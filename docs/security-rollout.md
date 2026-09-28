# Security rollout

Production project: `szinveszt-46398`. On 2026-09-25 its live Firestore release still contained `allow read, write: if true`. Do not treat repository rule edits as protection until deployed.

The live Storage rule allows any signed-in user to access ticket objects. A read-only migration audit found 16 ticket documents with 17 long-lived download-token URLs. On 2026-09-26 all seven confirmed employees received `staff: true`; the owner also received `role: admin`, while the other six received `role: staff`. A verbose Firebase CLI diagnostic printed the configured Billingo key into local tool logs; rotate that key before/at deployment.

## Before deployment

1. In Google Cloud, enable a managed Firestore backup schedule and complete a one-time backup/export. The backup-schedule API returned no schedules on 2026-09-25. Verify the destination and restore procedure. Also back up the Storage bucket containing ticket attachments. Keep copies outside the application project. Do not store backup files in this repository.
2. From `functions`, set `GOOGLE_APPLICATION_CREDENTIALS` to an authorized ADC/service-account credential and run `node scripts/listStaff.js szinveszt-46398`. Confirm the exact authorized email/UID list with the owner. Do not infer staff access from existing Firebase Auth accounts.
3. Run `node scripts/bootstrapStaff.js --project szinveszt-46398 --uids UID1,UID2 --admin-uid UID1` to review. Only after approval, repeat with `--apply`. Existing unrelated custom claims are preserved. Ask staff to sign in again or refresh their ID token.
4. Verify at least one approved user can access the application in a staging/emulator environment. Test a user without the claim and a signed-out browser: both must be denied. Check clients, tickets, profiles, monthly tasks, the import wizard, Billingo, NAV, and ticket uploads/downloads.
5. Validate rules with `firebase deploy --only firestore:rules,storage --dry-run --project szinveszt-46398`.

Run `npm run test:rules` with `FIRESTORE_EMULATOR_HOST` and `FIREBASE_STORAGE_EMULATOR_HOST` set to local emulator addresses to exercise guest, non-staff, and staff cases. These tests use a separate demo project ID and do not clear existing emulator data.

## Controlled deployment

Deploy Firestore and Storage rules, the selected Cloud Functions, and Hosting in one maintenance window. Recheck the live Rules API release after deployment. Confirm the approved account still works and unapproved accounts get permission errors. Monitor function and client error logs.

After the Firestore and Storage backups are confirmed, run `node scripts/migrateTicketAttachmentTokens.js --project szinveszt-46398 --bucket szinveszt-46398.firebasestorage.app` to review legacy ticket links. Then repeat with `--apply --backup-confirmed`. This invalidates old public download tokens and removes their URLs from ticket documents. Any attachments reported without a safe Storage path require manual review.

Ticket downloads now pass through the authenticated `ticketAttachmentDownload` function. Deploy that function before deploying Hosting with the updated client.

## Rollback

Keep the previous ruleset names and function deployment revision IDs. If staff access fails, restore the previous *restricted* release or correct claims; do not re-publish the old open Firestore rule. Ticket-token rotation is intentionally irreversible: restore metadata only from a secure backup if specifically required.

## Remaining security debt

NAV credentials still reside in client documents and remain visible to every approved staff account. They are excluded from ordinary exports now, but should move to a server-only secret store with a separate migration and least-privilege workflow. Firestore rules cannot conceal individual fields of a readable document.

The production dependency audit still reports one high-severity `xlsx` advisory with no npm fix. The other six production advisories were addressed by compatible-range dependency updates. Plan a separate spreadsheet-parser replacement and regression pass for imports and exports.
