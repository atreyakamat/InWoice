# InWoice V3.5 Performance & Testing Report

## 1. Performance Report
*   **Bottlenecks:** 
    *   **Context Assembly:** `assembleBusinessContext()` in `contextService.js` loads ALL invoices, customers, and products into memory for the AI. This will OOM (Out Of Memory) at scale.
    *   **Dashboard Loading:** Similar issue; analytics aggregates load full tables instead of querying aggregates (e.g., `SELECT SUM(grandTotal)`).
*   **Optimizations:**
    *   Push aggregation to SQLite.
    *   Limit AI Context to recent data (e.g., last 30 days) and top N records.

## 2. Testing Report
*   **Backend:** Basic API tests exist (`test-v3-modules.js`, `test_api.js`). Coverage is roughly ~40%.
*   **Frontend:** Minimal unit tests. Reliance is heavily on manual QA.
*   **Targets:** 
    *   Implement Jest/Supertest for all API endpoints to hit 80% coverage.
    *   Use Cypress/Playwright for critical user journeys (Invoice Creation, Payment Linking).

## 3. Production Readiness
The application is functionally stable but structurally monolithic.
*   **Logs:** Morgan handles basic logging. Needs Winston/Pino for structured JSON logging in production.
*   **Backups:** Automated daily backups exist.
*   **Resilience:** Need PM2 or Docker Compose `restart: always` configured for zero-downtime reloads.
