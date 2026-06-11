# INWOICE V1 - BACKEND API & SERVICE ARCHITECTURE DOCUMENT

## Introduction

This document defines the complete backend API architecture of InWoice V1.

The purpose of this document is to standardize:

Routes

Controllers

Services

Business Logic

Validation

Authentication

Permissions

Response Formats

Future Integrations

The API layer serves as the communication bridge between:

Frontend

Database

AI Services

PDF Engine

Google Sheets

Email Services

Future Mobile Applications

Future Third-Party Integrations

---

# API Philosophy

Controllers should be thin.

Services should contain business logic.

Database access should be isolated.

Validation should happen before business logic.

Every endpoint should be predictable.

Every response should be consistent.

---

# Backend Folder Structure

backend/

src/

controllers/

routes/

services/

middleware/

validators/

prisma/

utils/

workers/

integrations/

ai/

emails/

pdf/

analytics/

types/

---

# Request Lifecycle

Request

↓

Middleware

↓

Authentication

↓

Validation

↓

Controller

↓

Service

↓

Database

↓

Response

---

# Standard API Response

Success

```json
{
  "success": true,
  "message": "Invoice created successfully",
  "data": {}
}
```

Error

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": []
}
```

---

# Authentication Module

Base Route

/api/auth

---

## POST

/api/auth/register

Create User

---

## POST

/api/auth/login

Generate JWT

---

## POST

/api/auth/logout

Invalidate Session

---

## GET

/api/auth/me

Current User

---

## POST

/api/auth/reset-password

Reset Password

---

# Customer Module

Base Route

/api/customers

---

## GET

/

Get Customers

---

## GET

/:id

Get Customer

---

## POST

/

Create Customer

---

## PUT

/:id

Update Customer

---

## DELETE

/:id

Delete Customer

---

## GET

/:id/invoices

Customer Invoices

---

## GET

/:id/activity

Customer Activity

---

## GET

/search

Search Customers

---

# Product Module

Base Route

/api/products

---

## GET

/

List Products

---

## POST

/

Create Product

---

## PUT

/:id

Update Product

---

## DELETE

/:id

Delete Product

---

## GET

/search

Search Products

---

# Pack Module

Base Route

/api/packs

---

## GET

/

Get Packs

---

## GET

/:id

Get Pack

---

## POST

/

Create Pack

---

## PUT

/:id

Update Pack

---

## DELETE

/:id

Delete Pack

---

## POST

/:id/add-product

Attach Product

---

## DELETE

/:id/remove-product

Remove Product

---

# Invoice Module

Base Route

/api/invoices

---

## GET

/

List Invoices

---

## GET

/:id

Invoice Details

---

## POST

/

Create Invoice

---

## PUT

/:id

Update Invoice

---

## DELETE

/:id

Delete Invoice

---

## POST

/:id/clone

Clone Invoice

---

## POST

/:id/send

Send Invoice

---

## POST

/:id/regenerate

Regenerate PDF

---

## GET

/:id/download

Download PDF

---

## GET

/search

Search Invoices

---

# Invoice Creation Payload

```json
{
  "customerId": "",
  "items": [],
  "discount": 0,
  "tax": 0,
  "shipping": 0,
  "notes": ""
}
```

---

# PDF Module

Base Route

/api/pdf

---

## POST

/generate

Generate PDF

---

## POST

/regenerate

Regenerate PDF

---

## GET

/:id

Fetch PDF

---

# Email Module

Base Route

/api/email

---

## POST

/send-invoice

Send Invoice

---

## POST

/send-test

Test SMTP

---

## GET

/logs

Email History

---

# Dashboard Module

Base Route

/api/dashboard

---

## GET

/overview

Dashboard Overview

---

## GET

/revenue

Revenue Metrics

---

## GET

/activity

Recent Activity

---

## GET

/top-products

Best Sellers

---

## GET

/top-packs

Best Packs

---

# Analytics Module

Base Route

/api/analytics

---

## GET

/revenue

Revenue Analytics

---

## GET

/customers

Customer Analytics

---

## GET

/products

Product Analytics

---

## GET

/packs

Pack Analytics

---

## GET

/trends

Growth Trends

---

# Google Sheets Module

Base Route

/api/sheets

---

## POST

/sync

Manual Sync

---

## GET

/status

Sync Status

---

## POST

/retry

Retry Failed Sync

---

# File Upload Module

Base Route

/api/files

---

## POST

/upload

Upload File

---

## GET

/:id

Fetch File

---

## DELETE

/:id

Delete File

---

# Settings Module

Base Route

/api/settings

---

## GET

/

Get Settings

---

## PUT

/

Update Settings

---

# AI Module

Base Route

/api/ai

---

## POST

/chat

AI Chat

---

## POST

/summary

Business Summary

---

## POST

/recommendations

Business Recommendations

---

## POST

/insights

Business Insights

---

# Middleware Layer

Authentication

Authorization

Validation

Rate Limiting

Error Handling

Request Logging

---

# Validation Layer

Customer Validation

Product Validation

Pack Validation

Invoice Validation

Settings Validation

AI Request Validation

---

# Service Layer

CustomerService

ProductService

PackService

InvoiceService

PDFService

EmailService

AnalyticsService

AIService

SettingsService

---

# Event Triggers

Invoice Created

↓

Generate PDF

↓

Sync Sheets

↓

Create Activity

↓

Update Dashboard

↓

AI Memory Update

---

# Security Requirements

JWT

Password Hashing

Input Sanitization

Rate Limiting

Helmet

CORS

Validation

Audit Logs

---

# Logging Requirements

Request Logs

Error Logs

Invoice Logs

Email Logs

Sync Logs

AI Logs

---

# Future API Expansion

Inventory APIs

Marketplace APIs

Creator APIs

Affiliate APIs

Workflow APIs

Agent APIs

Mobile APIs

Public APIs

---

# Final Objective

The Backend API Layer should become the central nervous system of InWoice.

Every screen.

Every workflow.

Every AI action.

Every integration.

Should communicate through this architecture.

The API should remain clean, scalable, predictable, and future-proof as the platform evolves from an invoice generator into a complete Business Operating System.
