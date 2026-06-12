# InWoice V3.5 Security & Database Report

## 1. Security Audit
*   **Authentication:** JWT based. Needs robust token revocation or short-lived access tokens with HTTP-only refresh cookies.
*   **Authorization:** Currently single-tenant. No Role-Based Access Control (RBAC). 
*   **File Uploads:** Multer is used. Requires stringent MIME type checking and file size limits (currently at 10mb global).
*   **AI Security:** OpenRouter API keys are now securely stored in DB and never exposed to the frontend.

## 2. Database Report
*   **Current State:** Better-SQLite3 handles synchronous loads well.
*   **Optimization Needs:** 
    *   Missing indexes on frequently joined columns like `customerEmail` in `invoices` and `conversation_id` in `ai_messages`.
    *   `whatsapp_messages` and `generation_logs` tables will grow infinitely. A cleanup cron job is required.
    *   Foreign key constraints exist but need strictly enforced cascading deletes (some exist, some don't).

**Recommendations:**
Run `CREATE INDEX` on `invoices(customerEmail)`, `whatsapp_messages(chat_id)`, and `ai_messages(conversation_id)`.
