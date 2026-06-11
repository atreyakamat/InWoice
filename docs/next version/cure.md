# System Architecture and Feature Overview for InWoice v2.1

 The InWoice platform will be built as a **modular, cloud-native web application**. We adopt a **microservices-style architecture**: independent services (Invoice, CRM, Accounting, Analytics, etc.) each manage their own data and logic.  Services communicate via well-defined APIs (HTTP/REST or gRPC) through an API gateway layer.  Each service is deployed in containers (Docker) and orchestrated (e.g. Kubernetes) for scalability and resilience.  This decoupling allows each module to be developed, tested and scaled independently. For persistence, we use **polyglot persistence**: for example, PostgreSQL for transactional data (invoices, customers) and a document or vector store (MongoDB, Redis, etc.) for session, caching or semantic search indices.  

Services run behind an **API gateway** (or reverse proxy) that handles routing, authentication (JWT), SSL termination and rate limiting.  We enforce **HTTPS (TLS)** everywhere to protect data in transit.  Logging and observability (structured logs with Winston, metrics, tracing) are centralized to monitor performance and detect issues.  Runtime environments are strictly separated (dev, staging, prod) with CI/CD automation. Overall, this **distributed, containerized architecture** ensures high availability, easy horizontal scaling, and isolated failure domains.

## Core Invoice Management

The **Invoice module** is the heart of InWoice. It provides full CRUD for invoices, plus advanced billing features. Key features:

- **Invoice Creation & Lifecycle**: Users can create, edit, clone or delete invoices. Each invoice records customer, date, line-items and total. Status is tracked in a lifecycle (Draft, Pending, Paid, Overdue). Best practice is to enforce strict status workflows: e.g. only “Draft” invoices can be edited, “Paid” invoices are final. Searching/filtering by date, status or customer is supported via indexed database fields. (For heavy querying, a search service or Elasticsearch could be added later.)

- **Product Catalog & Pricing**: A **Product** sub-module stores reusable items/services (with name, description, unit price, tax rate). When creating an invoice, users can select products or add custom line items. This eliminates retyping prices each time. In future, we’ll extend this with **Packs/Inventory**: allowing grouping items into bundles (“sticker packs”) and tracking stock. This ensures sales of pre-defined bundles auto-adjust inventory and pricing.

- **Tax & Discounts**: The system auto-calculates taxes (GST/VAT) and discounts per line and overall. We incorporate a **Smart Tax** engine: e.g. using tax rules based on location/currency. For India’s GST compliance, the module must support e-invoicing mandates and correct tax splitting. The system should log tax rates used for audit. Invoicing supports item-level or invoice-level discounts (flat or percentage).

- **Payment Integration & UPI QR Codes**: Invoices generate a UPI QR code (for Indian businesses) or payment link. We integrate with UPI payment APIs (Razorpay, Setu, etc.) so that when an invoice is issued, the system **generates a UPI QR code** that customers can scan to pay. The backend calls the UPI API to create a collect request or intent (which returns a QR code or deep link). When payment is confirmed (via webhook), the invoice status updates to Paid. This mirrors how modern e-commerce uses payment gateways. In future we could add recurring billing or subscriptions via UPI AutoPay or credit cards.

- **PDF Generation & Caching**: We use a **headless browser** (Puppeteer) or dedicated PDF library to render branded invoice PDFs on demand. The PDF template mirrors our HTML/CSS styles. Generated PDFs are cached (e.g. in S3 or Redis) to speed up repeated accesses – benchmarks show ~80% faster retrieval when cached. A Node/Puppeteer service generates PDFs asynchronously. Bulk actions allow exporting invoices to CSV or PDF batches (e.g. end-of-month).

- **Notifications & Sharing**: After invoice creation, the system can email/PDF/WhatsApp the invoice to the customer. For emails we use an SMTP service (SendGrid/Gmail). For WhatsApp, we use Meta’s Business API: it sends a secure public link or PDF preview. Invoices also support a secure public **web view** (token-based URL) so customers can view/pay online.

This module is designed for robustness: each invoice operation is ACID-backed in the database, with business rules enforced. Future scope: **recurring invoices**, multi-currency support, and integration with subscription management (e.g. pay-as-you-go). We will also consider an invoice workflow (approve/draft by manager) as needed. All development follows the **billing software best practices**: transaction logging, audit trails, and rollback on failure.

## Customer Relationship Management (CRM)

The **CRM module** automatically tracks customers and their history. Its role and features:

- **Auto-Provisioning & Profiles**: Whenever an invoice is issued to a new customer, the system auto-creates a **Customer profile** (name, email, phone, Instagram handle, etc.). Each profile aggregates contact details, billing/shipping addresses and payment history. This becomes the single source of truth for that customer across the app.

- **Purchase History & Analytics**: Each Customer profile displays lifetime metrics: **Total Revenue**, number of invoices/orders, average payment time, days since last purchase, etc. We calculate Lifetime Value (LTV) and average Days-to-Pay. These metrics allow quick assessment of customer value. For example, the user list describes “Regular, Loyal, VIP” segments by spend/frequency. We implement these via SQL queries or simple MapReduce. Dashboards (in **Analytics**) aggregate these across customers.

- **Segmentation & Churn**: We implement dynamic segmentation rules: e.g. classify a customer as **VIP** if total spend > X, **Loyal** if frequent purchases, **At Risk** if no purchase >90 days, **New** if first invoice. This can be done via cron jobs or database views, updating a “segment” field on each profile. We can also export these groups for targeted campaigns. Similar approaches are widely used to focus retention efforts on high-value segments. We will track churn metrics (monthly retention rate) so we know when a customer transitions from “loyal” to “at-risk.” 

- **CRM Search & Links**: A quick search finds a customer by name, email or social handle (Instagram API integration could verify handles). Each invoice links back to its Customer. We also log communications (emails sent, WhatsApp exchanges) in the profile’s timeline for context.

- **Lifecycle & Retention Analytics**: Behind the scenes, we compute churn/retention cohorts (e.g. customers by acquisition month) to analyze trends. These allow spotting if churn is rising. While not strictly required day-1, we plan monthly cohort reports to inform business decisions.

The CRM service interfaces with other modules: Invoice (reads invoices to compute spend), Analytics (for reports), and Marketing (to target segments). In future, this CRM could connect to external CRM tools (like HubSpot) via APIs. For now it’s an integrated, simplified CRM tailored for small business.

## AI Automation & Intelligence

To streamline data entry and insights, InWoice includes advanced AI features:

- **Voice-to-Invoice**: Users can speak an order or expense, and the system transcribes it into invoice data. We integrate speech-to-text (e.g. OpenAI Whisper or Google Speech API) to get raw text, then an LLM (Local Ollama or cloud GPT/Gemini) to parse that text into structured line items. For example: “Sold 5 packs of stickers at 10 rupees each to Alice” → Customer=Alice, Quantity=5, Product=Stickers Pack, Unit Price=₹10, etc. This requires a robust prompt/validation pipeline but can save time on mobile.

- **OCR Scanner for Paper Receipts**: We include an OCR tool (Tesseract or Google Vision) so users can snap receipts or bills. The OCR extracts dates, vendor name, total amount, taxes, line items. Then AI matches those lines to Products or Accounts in the system. For example, it can recognize a vendor’s name and auto-fill “Office Supplies” expense. The OCR runs on the backend (Node/Python) and flags any unrecognized fields for manual review.

- **WhatsApp Order Extraction**: Many small businesses take orders via WhatsApp chat. We plan an “Order Import” feature: the user can forward chat text or upload a chat export, and an LLM will parse it to find order details (items, quantities, customer info). This semi-automates invoice creation from conversational data.

- **Semantic Search**: Beyond keyword search, we incorporate a semantic search for Products and Customers. For example, a user could type “invoice with stickers pack by Alice” and the system finds the matching records. Under the hood, this uses text embeddings (via OpenAI or local LLM) stored in a vector DB (e.g. Pinecone or Weaviate). Each product/customer name and description is embedded, enabling intuitive retrieval.

- **Automated Categorization**: For expenses and incomes entered ad-hoc, we use AI to tag them. For instance, a “Coffee expense” might be auto-tagged as “Meals” or “Office Supplies.” This uses a trained classification model or prompting. Such automation ensures consistent categorization without manual effort.

This AI/automation backend can run either on-premise (Ollama models with local GPUs) or via cloud APIs (Google Gemini, OpenAI). We design it as a “Hybrid AI service” so it can use local resources when online is expensive, and fall back to cloud for more capability. These features greatly reduce data-entry work and surface insights (e.g. “this customer usually orders X”).

## Accounting & Financial Tools

To provide robust finance management, we include full accounting support:

- **Double-Entry Ledger**: We implement a double-entry accounting system for accuracy. Every financial transaction (invoice paid, expense logged, bank deposit) creates two ledger entries (debit and credit) so that books always balance. For example, receiving payment credits “Accounts Receivable” and debits “Bank” for the same amount. Using established accounting principles (GAAP/IFRS) ensures integrity and auditability. In practice, our code treats the ledger as an immutable transaction log, where each entry has a unique ID and timestamp (as advised by Formance’s double-entry model). We may use an existing library or database schema for this, or build it from scratch following double-entry concepts.

- **GST and Tax Reporting**: The system automatically generates tax reports (e.g. monthly GST returns). It tallies invoice taxes (collected) vs. expense taxes (paid) and prepares data for filing. Built-in tax tables ensure correct calculation (rates change by product category or location). We will include a module to export these reports in the required format, even automating E-Waybill or E-Invoice uploads in the future. This reduces compliance effort.

- **Bank Reconciliation**: Users can upload bank statements (CSV/PDF). An import service parses transactions (using OCR/CSV parser), then **reconciles** them against invoices and payments in the system. It matches by amount/date and flags discrepancies. Over time, we can integrate with bank APIs (via Plaid-like services) to fetch transactions automatically. This ensures that internal records align with bank activity.

- **Expense Tracking**: Besides invoices, businesses have outgoing expenses (inventory purchase, utilities, travel). We allow recording expenses with categories and link them to projects or cost centers. Each expense posts to the ledger (debit expense account, credit bank/cash). Users can attach receipts (images/PDF).

- **Profit & Loss (P&L) Dashboard**: An executive dashboard summarizes financial health: real-time revenue, cost of goods sold, gross margin, net profit. We compute P&L from the ledger entries. This uses charting tools and can display trends. E.g. line chart of monthly revenue vs. expenses. Having P&L in the app helps small businesses see profitability instantly.

- **Payment Method Distribution**: Reports break down revenue by method (UPI, bank transfer, cash, card). This assists in deciding which channels to promote. (Implementation: tag each payment by method and aggregate.)

All finance features are underpinned by secure handling of currency and amounts (use `decimal` types to avoid float errors). Regular database backups are scheduled to protect the financial data. 

## Analytics & Reporting

We provide rich analytics and custom reports for data-driven decisions:

- **Interactive Dashboard**: The homepage shows key KPIs and charts: total revenue (period), expense total, profit, average invoice value. These are rendered using chart libraries (e.g. Chart.js or D3). Data queries are optimized (e.g. pre-aggregations) for real-time updates. A snippet from the industry emphasizes that dashboards should show revenue and aging receivables. 

- **Sales Forecasting**: Using historical invoice data, we project future revenue. At a basic level, we fit trends (linear or seasonal). In advanced phase, we might apply time-series forecasting models. Forecasting helps in planning cashflow and inventory. (The SoftwareMind guide notes that predictive metrics support planning.)

- **Product Performance**: Reports list best-selling products and most profitable items (taking into account cost or discount). This is a simple query: group invoices by product and sort. Graphs highlight top 5 products and profit margins.

- **Cohort Analysis**: We implement cohort charts for customer behavior. For example, show retention rate of customers by signup month. This helps see if customers keep buying over time. Cohort analysis is a well-known tool to track customer segments. It leverages the customer purchase history.

- **Conversion Tracking**: If we integrate with marketing (e.g. capturing leads), we can track lead-to-sale conversion rates. (Future feature: track how many contacts became paying customers.)

- **Export Center**: All data (invoices, customers, products) can be exported as CSV for external analysis. This is a simple bulk query and file write. CSV export is essential for accounting and audits.

These analytics use the data warehouse approach: optionally we can maintain an OLAP cube or use a BI engine if the data grows large, but initially Postgres with indexed tables and caching will suffice. Users can filter and pivot within the app.

## Integrations & External Sync

To fit into the business ecosystem, InWoice supports integrations:

- **Google Sheets Sync (Cloud Backup)**: Every change to InWoice data can be mirrored to Google Sheets for secondary backup. For example, a script writes new invoices and customers to a Google Sheet via API. This provides an offline-accessible backup and enables sharing raw data. Real-time sync ensures data is not lost even if the main DB has issues.

- **Email Client & IMAP**: The app includes an SMTP client (for sending invoices and newsletter campaigns) and can connect to an IMAP mailbox. We’ll optionally allow linking a business email account: incoming order emails can be automatically attached to customer records or tasks. This keeps communication history (orders, inquiries) in one place. Standard Node libraries (Nodemailer, imap-simple) handle this.

- **WhatsApp Sharing**: We integrate with the **WhatsApp Cloud API** (Meta’s Business API). The user can click “Share Invoice” and it sends a link or PDF to the customer’s WhatsApp. This requires registering as a WhatsApp Business and using the API for messaging. This feature is increasingly important in markets where WhatsApp is ubiquitous.

- **Offline-First Design**: The app is a **Progressive Web App (PWA)**. Clients (browsers or a wrapped mobile app) store data locally (IndexedDB or SQLite) and continue to function offline. All reads occur against the local store first. Changes (new invoices/customers) are queued and synced to the server when the network returns. The Android data-layer illustration shows this approach: a local SQLite (or IndexedDB) acts as the *canonical source of truth* on the client, and sync services push updates to the server. We follow the offline-first pattern: optimistic UI updates locally, then reconcile with server state. Conflict resolution (e.g. two devices editing the same customer) can use “last write wins” or prompt the user if needed.

- **Public Invoice View**: Every invoice has a public link (secure token). This is essentially a read-only view of the invoice in the browser (via a React route). We securely validate the token so only the intended customer can see it. This allows customers to pay or download the PDF without needing an account.

These integrations make InWoice a hub for business data. In future, we could add connectors (Zapier, Slack, QuickBooks) so data flows seamlessly to other tools.

## Marketing & Task Management

Beyond invoicing, InWoice includes light CRM and task tools to improve operations:

- **Marketing Campaigns**: Users can create email or WhatsApp campaigns (e.g. seasonal offers). A campaign module lets them define a message template, target customer segment (from CRM), and schedule sends. The system then batches and sends via SMTP or WhatsApp API. Tracking links in emails can log clicks in the system. (This is like a mini-Marketing module to drive repeat sales.)

- **Lead Tracking**: Before customers are invoiced, they may come in as leads. We provide a simple lead board where incoming leads (via a form or copy-paste) can be entered with details. Leads have statuses (New, Contacted, Won, Lost). When a lead makes a purchase, it is converted into a Customer/invoice. We track conversion rates.

- **Kanban Task Manager**: An integrated task board (Kanban style) lets the business owner manage operations (e.g. “Order supplies”, “Contact vendor”, “Design new pack”). Each task can have assignees, deadlines and statuses. We’ll use a React drag-and-drop Kanban component (like react-beautiful-dnd). This is more of an internal tool to ensure nothing falls through the cracks.

- **Customer Feedback**: After invoice payment, customers can be asked to leave a review or rating. A simple form (email link or on the invoice page) lets them submit feedback, which is stored and can be viewed in the CRM. Over time we gather NPS or satisfaction scores.

These modules are less critical at launch but planned for later phases. They round out the platform by merging simple marketing and project management into the invoicing system.

## Security and Infrastructure

Security is a top priority across the stack:

- **Authentication**: We use JWT tokens for stateless auth. Access tokens are short-lived (stored in memory or httpOnly cookies) and refresh tokens (in httpOnly cookies) allow seamless login refresh. This approach avoids storing tokens in localStorage (which is vulnerable to XSS). All API routes validate JWTs on each request.

- **Encryption & Secrets**: All passwords are stored hashed with bcrypt (10+ salt rounds). Sensitive configuration (DB passwords, API keys) use environment variables (dotenv) and never appear in code. HTTPS is enforced in production.

- **Input Validation**: Every API request is validated with strict schemas (e.g. using Zod or Joi) to prevent injection or malformed data. For example, invoices must have positive amounts, customer names are sanitized, etc. We also sanitize payloads (e.g. with express-mongo-sanitize or xss-clean) to prevent XSS/NoSQL injection.

- **Rate Limiting and Brute-Force Protection**: Important endpoints (login, sign-up, invoice creation) are rate-limited (e.g. max 100 requests per minute per IP) using middleware like `express-rate-limit`. This thwarts denial-of-service or brute-force attacks. We also implement CAPTCHA or IP locking after repeated failures.

- **HTTP Security Headers**: We use Helmet middleware to set strong HTTP headers (CSP, HSTS, XSS protection, etc). For example, `X-Content-Type-Options`, `X-Frame-Options`, and `X-XSS-Protection` are all managed. This reduces attack surface.

- **CORS and CSRF**: Our backend sets strict CORS policies (only our frontend domain is allowed). We also implement CSRF tokens for state-changing operations if cookies are used for auth. Alternatively, using JWT in an API header avoids CSRF. 

- **Logging & Monitoring**: All errors are logged using Winston (with file rotation) and alerts (Slack/email) for critical issues. We audit all sensitive actions (invoice issuance, user creation) with timestamps and user IDs. This ensures traceability for audits. 

- **Resilience & Limits**: We limit upload sizes and enforce size limits on data (e.g. max 10MB file attachments). Static file and PDF generation are rate-limited. Circuit breakers (retry with backoff) are in place for external calls (email, payment APIs) to fail gracefully.

- **Isolation & DevOps**: Development, staging and production environments are isolated. Secrets in dev use dummy values. We use CI/CD pipelines to automate testing and deployment. For database, backups (and optionally read replicas) are configured. The system is containerized (Docker) to ensure environment consistency and ease scaling.

By following industry best practices, we minimize risk. For example, Express documentation recommends TLS and Helmet, and Node security guides emphasize input validation, rate limiting, and HTTPS, all of which we apply. 

## Data Models

Key data entities include:

- **User**: Represents an account holder (the business owner or staff). Fields: id, name, email, role (admin/user), hashed password, settings.
- **Customer**: id, name, contact info, lifetime value, segment, lastInvoiceDate, etc.
- **Product/Item**: id, name, description, unit price, tax rate, stock level.
- **Invoice**: id, customer_id, issue_date, due_date, status, total, etc.
- **LineItem**: invoice_id, product_id or custom description, quantity, unit_price, discount, tax_amount, line_total.
- **Payment**: id, invoice_id, method (UPI, Bank, Cash, Card), amount, date, reference.
- **Expense**: id, category, amount, description, date, receipt (file URL).
- **LedgerEntry**: id, transaction_id, account (e.g. “Bank”, “Revenue”), type (debit/credit), amount, timestamp.
- **Task/Lead**: For future modules, with fields for title, status, assignee, etc.
- **Campaign**: id, name, channels, recipients, schedule.

Tables are related with foreign keys (e.g. invoice.customer_id → Customer). We apply cascading where appropriate. Many-to-many (e.g. products ↔ packs) use join tables.

## Phased Roadmap

We recommend implementing features in phases:

- **Phase 1 (MVP)** – *Core billing and CRM*: Complete Invoice CRUD, PDF/UPI integration, basic Product catalog, and Customer auto-creation. Implement JWT auth, core database schema, and admin UI. Launch with essential accounting (simple revenue report) and basic dashboard.
- **Phase 2 (Accounting & Sync)** – Add double-entry ledger, expense tracking, and GST reporting. Build bank statement import and reconciliation. Implement offline-first PWA support so data syncs between web and local store. Integrate email/WhatsApp sharing and Google Sheets backup. 
- **Phase 3 (AI & Analytics)** – Develop AI-powered features: OCR scanning, voice parsing, semantic search and AI tagging. Enhance Analytics: forecasting, cohort reports. Add marketing emails/WhatsApp campaigns and task board. 
- **Phase 4 (Scale & Extend)** – Prepare for multi-tenant SaaS: separate customer data per business (shared DB with tenant scoping initially). Implement finer access control (RBAC per team), multi-currency, and plugin system. Polish security (audits) and performance (microservices scaling). Expand integrations (e.g. QuickBooks, Zapier) and mobile app wrappers.

Each phase includes testing and feedback from stakeholders. This staged approach minimizes risk and delivers value early. Throughout, we follow software development best practices: clear requirements, code reviews, and incremental releases. 

By the end of this roadmap, InWoice will be a **unified, scalable platform** where a small business can manage invoicing, accounting, customers and growth campaigns all in one place. It will stand out by combining offline-first reliability, AI automation, and financial rigor – features that many simple invoicing tools lack. 

**Sources:** We drew on best practices from modern SaaS architectures and billing systems. For example, Atlassian’s microservices guide highlights independent services and APIs; industry blogs emphasize the need for rigorous invoicing flows and tax handling; and modern security references stress JWT, validation and HTTPS. Our design synthesizes these insights into a custom solution for the Stix N Vibes business.