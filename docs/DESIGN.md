# Design Documentation - InWoice

## 1. Architectural Overview
InWoice follows a **Hybrid Microservices** architecture with a centralized Node.js API that acts as the primary orchestrator.

### 1.1. System Diagram (Abstract)
- **Frontend (React):** User Interface and "Live Preview" logic.
- **Backend (Node):** Database management, PDF generation, Emailing, and AI Orchestration.
- **AI Microservice (Python):** Specialized NLP for invoice parsing.
- **Cloud Services:** Google Sheets (Backup) and Gemini (AI Fallback).

## 2. Key Design Principles

### 2.1. Offline-First Synchronization
To ensure 100% uptime in homelab environments with potential network issues:
- All changes are first saved to the local `database.json`.
- A frontend "Outbox" system catches invoices created when the browser is offline.
- A "Fire and Forget" async sync ensures that Google Sheets is updated without blocking the user.

### 2.2. Intelligent Routing (AI)
The `aiRoutes.js` uses a **Priority-Based Fallback** strategy:
1. **Ollama:** Check if a local Ollama instance is active (Lowest latency, 100% private).
2. **Local Python:** Check if the FastAPI microservice is running.
3. **Gemini Cloud:** Fallback to Google Gemini if local options are unavailable.

### 2.3. PDF Safety & Templating
The system uses **Puppeteer + Handlebars-style** template injection:
- **Sanitization:** All user-provided data is HTML-encoded using `he` to prevent XSS in generated PDFs.
- **Modular Template:** `invoiceTemplate.html` can be swapped or edited for branding updates.

## 3. Data Model
- **Invoices:** Central record, includes a parseable `itemsJSON` field.
- **Customers:** Automatically derived from invoice records to reduce setup friction.
- **Settings:** Persistent global state for SMTP and Business Branding.

## 4. Security Design (Homelab Edition)
- **Hardcoded Token:** A pre-shared token system is used instead of complex JWT/OAuth for simplicity and ease of backup.
- **Password-Gate:** A simple login page protects all write-capable dashboard routes.
- **Public Routes:** `/view-invoice/:id` and `/api/web-invoices/:id` are exposed for customer access without authentication.
