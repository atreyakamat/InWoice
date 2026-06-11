# Tech Stack - InWoice

## 1. Frontend
- **Framework:** React 18
- **Styling:** Tailwind CSS (Modern, utility-first design)
- **Routing:** React Router DOM v7
- **Icons:** Lucide-React
- **Charts:** Recharts
- **HTTP Client:** Axios
- **State Management:** Local Storage for offline drafts and auth tokens.

## 2. Backend (Main API)
- **Runtime:** Node.js
- **Framework:** Express.js
- **PDF Engine:** Puppeteer (Headless Chrome)
- **Email Service:** Nodemailer
- **Authentication:** Middleware-based hardcoded password verification.
- **Validation:** Zod (Type-safe schema validation)
- **Utilities:** Nanoid (Secure unique IDs), He (HTML encoding for PDF safety).

## 3. Local AI Microservice
- **Runtime:** Python 3.10+
- **Framework:** FastAPI
- **Model Engine:** Hugging Face Transformers
- **Local Model:** Qwen-2.5-1.5B (Lightweight, high-performance)
- **Alternate Support:** Ollama integration via REST API.

## 4. Cloud Integration
- **AI Fallback:** Google Gemini API (Flash 2.5)
- **Cloud Database Sync:** Google Sheets API v4
- **Auth:** Google Application Credentials.

## 5. Storage
- **Primary:** `database.json` (Local persistent storage).
- **Secondary:** Google Sheets (Cloud mirror/backup).

## 6. Deployment
- **Homelab:** Deployable as a multi-service application (Node + Python + React Build).
