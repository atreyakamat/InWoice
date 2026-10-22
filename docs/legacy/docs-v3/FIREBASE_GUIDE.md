# Firebase Guide for InWoice

This project supports two backend data modes:

- SQLite-backed local mode when no Firebase credentials file is present.
- Firebase Admin mode when `backend/firebase-credentials.json` exists.

## When to use Firebase

Use Firebase if you want:

- Shared cloud data for multiple operators.
- A managed Firestore database instead of local JSON persistence.
- Easier multi-environment deployment for staging and production.

Keep SQLite for:

- Local development.
- Offline or single-user testing.
- Fast smoke tests without cloud access.

## What to add

Add these items before enabling Firebase mode:

1. A Firebase project with Firestore enabled.
2. A service-account key downloaded as `backend/firebase-credentials.json`.
3. A protected backup strategy for Firestore exports.
4. Firestore indexes for the most common sorted queries.
5. A migration plan from the existing SQLite data set.

Suggested Firestore indexes:

- `invoices.date` descending
- `customers.email` ascending
- `journal_entries.date` descending
- `bank_transactions.date` descending

## Current Firebase data model

The server-side Firebase service writes to these collections:

- `settings`
- `products`
- `invoices`
- `customers`
- `accounts`
- `journal_entries`
- `bank_transactions`
- `tasks`
- `emails`
- `marketing_posts`

Accounting-related data uses the journal collections and account balances, so Firebase is not just a storage layer. It is part of the financial source of truth.

## Setup steps

1. Create a Firebase project in the Firebase console.
2. Enable Firestore for the project.
3. Create a service account and download the JSON key.
4. Save the file as `backend/firebase-credentials.json`.
5. Make sure the file stays out of source control. The repo already ignores `*.json` service-account files.
6. Start the backend.
7. Confirm the backend log says it is using Firebase Admin for database operations.
8. Run the migration script from the repo root:

```bash
node migrate_to_firebase.js
```

9. Run the backend smoke tests after migration.

## Environment notes

Firebase mode does not require a special runtime flag. The backend detects the credentials file automatically.

Useful environment variables:

- `JWT_SECRET` - required for auth.
- `FRONTEND_URL` - required for CORS in production.
- `GOOGLE_APPLICATION_CREDENTIALS` - used by Google Sheets integrations.

If you use Google Sheets syncing, keep that credentials file separate from the Firebase service-account key.

## Operational checks

- Confirm invoice CRUD works after migration.
- Confirm accounting journal entries are balanced.
- Confirm bank transaction imports still post entries correctly.
- Confirm backups or exports are configured for disaster recovery.
- Confirm your deployment process can rotate the Firebase credential file safely.

## Security checklist

- Never commit `backend/firebase-credentials.json`.
- Use least-privilege service accounts.
- Restrict production access to the backend only.
- Rotate credentials if they are exposed.
- Review Firestore usage and indexes after each schema change.

## Troubleshooting

- If the backend still uses SQLite, check that `backend/firebase-credentials.json` exists.
- If startup fails, confirm the service account JSON is valid and matches the Firebase project.
- If a query becomes slow, add the missing Firestore index instead of widening the data fetch.
