# Security Audit Deep Dive

This document summarizes the npm audit review and the practical remediation path.

## Summary

- Frontend: the app is functional and the smoke test passes, but `npm audit` still reports 26 vulnerabilities in the CRA/Jest toolchain.
- Backend: the app is functional and the smoke tests pass, but `npm audit` still reports 19 vulnerabilities concentrated in Firebase / Google Cloud and mail-related dependencies.

The security findings are now clearly split between application-level fixes that are already done and toolchain/dependency-chain issues that need larger upgrades.

## Current backend findings

### firebase-admin

- Direct dependency.
- Fix path: upgrade to a newer major release when the app is ready for it.
- Risk: moderate to high because it can affect the Firestore and auth APIs.

### axios

- Direct dependency in both backend and frontend.
- Fix path: upgraded to `^1.15.2`.
- Risk: low; this is the safest high-value upgrade in the audit.

### @google-cloud/firestore

- Transitive through `firebase-admin`.
- Risk: high due to the advisory associated with Firestore client internals.
- Recommended action: keep moving to the latest compatible `firebase-admin` and verify the app still passes the smoke suite after each bump.

### @grpc/grpc-js

- Transitive through Google Cloud libraries.
- Risk: moderate memory-usage issue.
- Recommended action: inherit the fix through Google Cloud package upgrades; do not patch this one in isolation.

### @grpc/proto-loader and google-gax

- Transitive through the Google Cloud stack.
- Risk: high because it fans out into Firestore-related behavior.
- Recommended action: upgrade the parent Google/Firebase package set together.

### jsonwebtoken

- Present in the backend tree through Firebase-admin internals.
- Risk: high to moderate depending on the exact advisory path.
- Recommended action: upgrade the package chain that brings it in, then retest auth flows.

### imap / mail-related path

- Appears in the backend audit path from the mail tooling.
- Risk: high because it is a network-facing parser.
- Recommended action: review mail features separately, minimize surface area, and consider replacing the parser stack if the app depends on it in production.

## Frontend findings

The remaining frontend findings are structural and mostly come from the `react-scripts` 5 toolchain:

- `@babel/plugin-transform-modules-systemjs`
- `@tootallnate/once` via `jsdom` / Jest
- `nth-check` via `svgo` / `react-scripts`
- `postcss` via `resolve-url-loader`
- `serialize-javascript` via `workbox` / minimizer tooling
- `underscore` via `jsonpath` / `bfj`
- `webpack-dev-server`

These are not isolated app-code bugs. Removing them safely would mean migrating away from the current CRA stack or replacing the problematic build dependencies, which is a larger change than a patch-level remediation.

## Recommended remediation order

1. Keep the current functional fix set: backend startup fix, Puppeteer stability fix, router test fix, axios bump, and test mocking.
2. Upgrade Firebase-related packages together and rerun the smoke suite.
3. Re-run `npm audit` after each dependency bump.
4. Review mail handling dependencies next.
5. Plan a frontend build-tool migration if the remaining CRA/Jest vulnerabilities must be removed completely.

## QA checkpoint after every upgrade

After any dependency bump:

- Start the backend.
- Run `node test-integration.js`.
- Run `node test-comprehensive.js`.
- Confirm login, invoice CRUD, customer detail, export, and PDF generation still work.

## Risk note

Some audit findings can only be removed by major-version upgrades in the Firebase ecosystem. Those upgrades are possible, but they are not guaranteed to be zero-downtime or zero-breakage. The frontend findings are even more structural: the current CRA toolchain is carrying the vulnerable packages, so a complete cleanup likely requires a build-system migration rather than another point release.
