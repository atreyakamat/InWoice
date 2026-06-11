# INWOICE V1 - PRODUCTION BUILD SPECIFICATION DOCUMENT

## Purpose

This document defines the exact version of InWoice that will be built and shipped first.

This document intentionally ignores future features.

The goal is to launch a working product.

Not a perfect product.

---

# V1 Objective

Create a complete invoice and business management platform for Stix N Vibes.

The platform should allow:

Customer Management

Product Management

Pack Management

Invoice Creation

PDF Generation

Email Sending

Google Sheets Backup

Dashboard Analytics

Basic AI Assistant

---

# Tech Stack

## Frontend

React

Vite

TypeScript

Tailwind CSS

shadcn/ui

TanStack Table

React Hook Form

Zod

Axios

---

## Backend

Node.js

Express.js

TypeScript

Prisma

JWT

Bcrypt

Multer

Nodemailer

---

## Database

PostgreSQL

---

## PDF

Puppeteer

---

## AI

Grok API

Gemini API

---

## Cloud Storage

Local Storage (V1)

Google Drive (V1.5)

S3 Compatible Storage (Future)

---

# Core Modules

## Authentication

Login

Register

Logout

JWT

Role Management

Password Reset

---

## Customers

Create Customer

Edit Customer

Delete Customer

Customer History

Customer Search

Customer Notes

---

## Products

Create Product

Edit Product

Delete Product

Categories

Pricing

Search

---

## Packs

Create Pack

Add Products

Edit Pack

Delete Pack

Pack Analytics

---

## Invoices

Create Invoice

Edit Invoice

Delete Invoice

Clone Invoice

Generate PDF

Download PDF

Send PDF

Regenerate PDF

Status Tracking

---

## Dashboard

Revenue

Invoices

Customers

Recent Activity

Top Products

Top Packs

Outstanding Payments

---

## Analytics

Revenue Analytics

Customer Analytics

Product Analytics

Pack Analytics

---

## Settings

Business Profile

Invoice Branding

Email Settings

AI Settings

Google Sheets Settings

---

# Exact Pages

/login

/register

/dashboard

/customers

/customers/:id

/products

/products/:id

/packs

/packs/:id

/invoices

/invoices/:id

/analytics

/settings

---

# Database Tables

users

customers

products

packs

pack_items

invoices

invoice_items

payments

settings

activity_logs

files

---

# Invoice Flow

Customer Selected

↓

Products Selected

↓

Pack Selected (Optional)

↓

Discount Applied

↓

Tax Applied

↓

Preview Generated

↓

PDF Generated

↓

Saved

↓

Email Sent

↓

Google Sheets Synced

---

# Email Flow

Invoice Generated

↓

PDF Attached

↓

Email Sent

↓

Delivery Logged

---

# Google Sheets Flow

Invoice Created

↓

Customer Data

↓

Invoice Data

↓

Payment Data

↓

Stored In Sheets

---

# Dashboard Widgets

Revenue Today

Revenue Month

Invoices

Customers

Top Products

Top Packs

Pending Payments

Recent Activity

---

# AI Assistant V1

Questions:

Show revenue.

Show top customers.

Show best products.

Show overdue invoices.

Show sales trends.

Generate business summary.

---

# Folder Structure

frontend/

backend/

database/

docs/

uploads/

exports/

---

Frontend

components/

pages/

hooks/

services/

types/

utils/

---

Backend

controllers/

routes/

services/

middleware/

prisma/

utils/

workers/

---

# Out Of Scope

Inventory

Marketplace

Creator Economy

Affiliate System

Advanced AI Workforce

Multi-Tenant SaaS

Advanced Accounting

Workflow Builder

Enterprise Features

---

# Success Criteria

Create Customer

Create Product

Create Pack

Create Invoice

Generate PDF

Email PDF

Sync Sheet

Dashboard Works

Analytics Works

AI Answers Questions

---

# Definition Of Done

A business owner can:

Create a customer.

Create a product.

Create a pack.

Generate an invoice.

Send invoice to customer.

Download invoice later.

Regenerate lost invoices.

View revenue dashboard.

Track sales.

Use AI assistant.

Without needing any other software.

---

# Final Objective

Ship.

Get feedback.

Get customers.

Improve.

Do not spend months building future architecture before validating the core platform.

The purpose of V1 is not perfection.

The purpose of V1 is proving that businesses want the product.
