# InWoice V4 Recommended Roadmap

Following the successful implementation of the V3.5 Hardening & AI Copilot sprint, the following roadmap is recommended to scale the Business Operating System:

## Phase 1: Micro-Repositories (Technical Debt)
*   Deconstruct `sqliteService.js` into modular repositories.
*   Implement dependency injection for easier unit testing.

## Phase 2: True Multi-Tenancy (SaaS Prep)
*   Add `tenant_id` to every table.
*   Implement RBAC (Admin, Manager, Viewer).

## Phase 3: AI Agents & Automation (The Next Frontier)
*   Move from an interactive *Copilot* to autonomous *Agents*.
*   **Marketing Agent:** Automatically drafts and posts to Instagram.
*   **Collection Agent:** Automatically sends polite WhatsApp reminders for overdue invoices.
*   **Procurement Agent:** Alerts when "Packs" are running low on required base inventory.

## Phase 4: Scalable Infrastructure
*   Migrate from SQLite to PostgreSQL when data size requires distributed reads or connection pooling.
*   Migrate Local File System (File Center) to AWS S3 / Cloudflare R2 for stateless deployments.
