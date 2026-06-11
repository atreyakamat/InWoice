# QA Guide for InWoice

This guide defines the minimum release gate for backend, frontend, and Firebase-backed deployments.

## Release gate

Do not release unless all of the following pass:

- Backend smoke suite passes.
- Frontend validation passes.
- Frontend tests pass in CI mode.
- npm audit has been reviewed.
- Firebase migration or sync checks pass when Firebase mode is enabled.

## Local verification

### Backend

```bash
cd backend
npm install
npm start
node test-integration.js
node test-comprehensive.js
```

### Frontend

```bash
cd frontend
npm install
node test-validation.js
CI=true npm test -- --watchAll=false --coverage --passWithNoTests
```

### Security audit

```bash
cd backend
npm audit

cd ../frontend
npm audit
```

## Firebase QA checks

When Firebase mode is active, verify:

- The backend starts with Firebase Admin mode enabled.
- The service-account file is not committed.
- The migration script completes on staging data.
- The primary collections contain expected records.
- Accounting flows still create balanced journal entries.
- Backups or exports are in place.

## Manual smoke tests

### Authentication

- Log in with the configured admin password.
- Confirm the JWT is returned.
- Confirm unauthorized requests still get `401`.

### Invoice flow

- Create an invoice.
- Open the saved invoice.
- Duplicate it.
- Update it.
- Export invoices to CSV.

### Customer flow

- Open the customer list.
- Open a customer detail page.
- Confirm the customer metrics render.

### Accounting flow

- Create or sync a paid invoice.
- Confirm the journal entry is balanced.
- Confirm the ledger updates correctly.

### PDF flow

- Generate a PDF invoice.
- Confirm the file downloads and opens.

## Sign-off checklist

Use this before merging or deploying:

- [ ] Backend tests passed.
- [ ] Frontend tests passed.
- [ ] Audit reviewed.
- [ ] Firebase checks passed if enabled.
- [ ] Deployment environment variables confirmed.
- [ ] No untracked secrets in the repo.
