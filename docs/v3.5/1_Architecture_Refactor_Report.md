# InWoice V3.5 Architecture & Refactor Audit Report

## 1. Architecture Audit
The platform has evolved significantly from a simple invoice generator to a Business Operating System (V3). 
*   **Database:** A single SQLite instance handles heavy multi-domain workloads (Invoices, CRM, AI Memory, WhatsApp, Banking).
*   **Services:** `sqliteService.js` has grown past 1,000 lines. It currently handles 30+ domain models. This is a monolithic bottleneck.
*   **Routes:** API endpoints are generally consistent, utilizing standard Express routers mounted on `/api/*`.

## 2. Refactor Report
**Identified Issues:**
1.  **Tight Coupling in DB Layer:** `sqliteService.js` contains all queries.
2.  **Duplicate UI Logic:** `InvoicePreview.jsx` and `WebInvoiceView.jsx` duplicate presentation logic.
3.  **Large Components:** `Settings.jsx` and `CustomerDetail.jsx` are monolithic.

**Action Plan (V4 Prep):**
*   Extract SQLite service into domain-specific repositories (e.g., `invoiceRepository.js`, `aiRepository.js`).
*   Implement a shared UI component library (e.g., `InvoiceDisplayComponent`).
*   Break `Settings.jsx` into tabbed components.
