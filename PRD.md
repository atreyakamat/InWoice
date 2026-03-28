# Product Requirements Document (PRD) - InWoice

## 1. Executive Summary
InWoice is a streamlined, AI-powered invoice management system designed for small businesses and independent creators. It prioritizes speed, automation, and offline accessibility for homelab deployments.

## 2. Objectives
- **Automation:** Reduce manual data entry using AI (Cloud and Local).
- **Efficiency:** Provide a high-density, keyboard-friendly UI for rapid invoice creation.
- **Reliability:** Support offline work with background synchronization.
- **Privacy:** Allow local-only AI processing for sensitive data.
- **Integrity:** Sync data to Google Sheets as a secondary cloud source.

## 3. Target Audience
- Small business owners (e.g., sticker shops, independent creators).
- Homelab enthusiasts who prefer self-hosted, privacy-first tools.

## 4. Functional Requirements

### 4.1. Invoice Management
- Create, view, update status (Pending/Paid), and delete invoices.
- Secure, unique Invoice ID generation.
- Dynamic PDF generation with custom branding and UPI QR codes.
- "Live Preview" (WYSIWYG) while drafting.

### 4.2. AI Features
- **Voice Parsing:** Convert spoken text into a structured invoice draft.
- **Hybrid AI:** Support for Google Gemini (Cloud), Ollama (Local), and custom Python microservices.

### 4.3. Communication
- Send invoices directly via SMTP Email.
- Send automated payment reminders for "Pending" invoices.
- One-click WhatsApp sharing.

### 4.4. Data & Connectivity
- Local JSON database for fast, offline-first performance.
- Automatic background sync for offline drafts.
- Real-time synchronization with Google Sheets.

### 4.5. Security
- Simple, hardcoded password-based login for homelab protection.
- Protected API routes and frontend dashboard.

## 5. Non-Functional Requirements
- **Performance:** UI updates must be sub-100ms for "Live Preview".
- **UX:** Modern, high-density aesthetic with a focus on "dark mode" or "soft-tech" vibes.
- **Maintainability:** Modular service-based architecture.
