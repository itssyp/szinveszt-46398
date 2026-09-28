# Staging environment

The `master` branch remains the production baseline. Develop and integrate changes on `staging`; create feature branches from `staging` and merge them back there for review. Promote a tested commit to `master` only after staging QA and a separate production rollout decision. Creating or switching branches does not deploy Firebase resources.

Firebase aliases in `.firebaserc` are `staging` (`szinveszt-staging`, also the CLI default) and `production` (`szinveszt-46398`). Always pass `--project` and `--only` to deploy commands. Never use an unqualified `firebase deploy`.

## Local web app

- `npm run dev:staging` serves the app at `http://localhost:3001` against the real staging Firebase project. It does not connect to local emulators or seed clients from the dev snapshot.
- `npm run build:staging` builds Hosting assets with the staging web configuration from `.env.staging`.
- `npm run deploy:staging:hosting` builds staging assets and deploys **Hosting only** to `szinveszt-staging`. It does not deploy Firestore rules, Storage rules, or Functions.
- `npm run dev` continues to use the existing ignored `.env` and local Firebase emulators for ordinary local development.

The Firebase web config in `.env.staging` is a public client identifier, not an administrative credential. The app does not use Analytics yet, so `measurementId` is present for future use but no Analytics SDK is initialized.

## Functions and data

Production Functions credentials have been kept locally in ignored `functions/.env.szinveszt-46398`. Staging has only an ignored `functions/.env.szinveszt-staging` with its own Storage bucket; `functions/staging.env.example` records that nonsecret setting for other checkouts. Firebase loads the project-specific file for the target project. Do not put a production Billingo key, NAV credentials, or production Storage bucket name into staging. Billingo features will remain unavailable there until a separate test integration is configured.

Before using staging as a full test environment, enable the required Firebase products in the staging console, create **test-only** Auth accounts, and use synthetic or anonymized clients. Do not copy live client records or credentials. Cloud Functions deployment and external integrations need their own staging setup and should be reviewed separately.

Use `firebase emulators:start --project production` for local development with the production-shaped emulator project ID; `.firebaserc` deliberately defaults unqualified Firebase CLI commands to staging.
