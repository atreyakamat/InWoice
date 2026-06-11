# InWoice V3: Full Business Operations & Accounting Expansion Plan

## 1. Executive Summary
The V3 expansion transforms InWoice from a simple invoicing tool into a comprehensive, Indian tax-compliant Business Operations and Accounting suite. The expansion includes a double-entry accounting engine, bank statement OCR processing with AI-assisted categorization, a built-in mail client, and task management.

## 2. Phase 1: Core Accounting Engine & Indian Tax Compliance
We need to upgrade the database schema (`sqliteService.js` / Firebase) to support full accounting.

### 2.1. Double-Entry Accounting Architecture
- **Chart of Accounts (CoA):** Standardized accounts (Assets, Liabilities, Equity, Revenue, Expenses).
- **Journal Entries & Ledger:** Every invoice, payment, and expense will generate dual journal entries (e.g., Credit Sales, Debit Accounts Receivable).
- **Reports:** Generation of Profit & Loss (P&L), Balance Sheet, and Trial Balance.

### 2.2. Indian Tax Compliance (GST & TDS)
- **GST Tracking:** 
  - Categorization of CGST, SGST, IGST based on intra/inter-state rules.
  - HSN/SAC code tracking for products/services.
  - Exportable GSTR-1, GSTR-2, GSTR-3B formats (CSV/Excel) for the CA.
- **TDS (Tax Deducted at Source):** Tracking TDS deducted by clients and TDS payable to vendors.

## 3. Phase 2: Bank Statement OCR & Reconciliation
Automating the ingestion of bank statements to reconcile payments and track expenses.

### 3.1. OCR Pipeline
- **Extraction:** Extend the local Python microservice (`local_ai`) to accept PDF bank statements using `pdfplumber` or Tesseract. Alternatively, use Google Gemini Pro Vision via the Node.js backend.
- **Parsing Engine:** Send the extracted raw text to the local LLM or Gemini to structure it into JSON (Date, Description, Amount, Debit/Credit).

### 3.2. Reconciliation UI
- **Transaction Dashboard:** A new React UI to view extracted bank transactions.
- **Categorization & Labeling:**
  - AI auto-suggests labels based on historical data.
  - User can flag transactions as "Personal" (ignored in business P&L) or "Business".
  - Link incoming deposits directly to pending Invoices (auto-mark as Paid).
  - Link outgoing deductions to Expenses/Vendors.

## 4. Phase 3: Built-in Mail Client
A unified inbox to handle client communication directly within InWoice.

### 4.1. Backend (Node.js)
- **IMAP Integration:** Use `node-imap` or `imap-simple` to securely fetch incoming emails.
- **SMTP Integration:** Enhance existing Nodemailer setup for threaded replies.
- **Storage:** Cache recent emails in SQLite or fetch on-demand to save space.

### 4.2. Frontend UI
- **Unified Inbox:** View emails, link specific email threads to Customers or Invoices.
- **Auto-Extract:** "Extract Invoice from this email" feature to process vendor bills using the AI.

## 5. Phase 4: Business Operations & Task Management
- **Task Board:** Kanban-style or List-based task assignment.
- **Roles:** Assign tasks to specific users (requires expanding the auth system from a single hardcoded password to a multi-user model, if team access is needed).

## 6. Implementation Strategy
1. **Approve Schema:** Update SQLite schema for Accounting (Ledger, Accounts, Taxes, Tasks).
2. **Build Accounting Backend:** Create API routes for Journal Entries, GST reports.
3. **Develop OCR Pipeline:** Add file upload for Bank Statements and the parsing logic.
4. **Reconciliation UI:** Build the React components to label and process bank entries.
5. **Mail Client:** Add IMAP syncing and the Inbox UI.

---
**Next Action:** Review this plan. If you agree, we will begin Phase 1 (Database & Core Accounting/Tax logic).

## 7. Implementation Status (2026-05-19)
- [x] Phase 1: CoA seeding, journal posting, GST/TDS fields, P&L/Balance Sheet/Trial Balance, GSTR exports
- [x] Phase 2: Bank statement OCR, reconciliation UI, invoice linking, vendor/GST capture
- [x] Phase 3: IMAP sync, SMTP replies, inbox linking, invoice extraction from email
- [x] Phase 4: Task board UI + API
- [x] Phase 5: AI Business Manager & Marketing Scheduler (AI-generated posts for WhatsApp, Instagram, LinkedIn, YouTube)

### Environment Defaults
- SMTP and IMAP can be provided via env (`SMTP_*`, `IMAP_*` or `IMAP_ACCOUNTS_JSON`) and are used as defaults when UI settings are empty.