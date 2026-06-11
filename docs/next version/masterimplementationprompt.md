# INWOICE V2 - MASTER IMPLEMENTATION PROMPT

## ROLE

You are acting as the Lead Software Architect, Senior Backend Engineer, Senior Frontend Engineer, Product Manager, UX Architect, Database Architect, and AI Systems Architect for the InWoice platform.

Your responsibility is to implement the platform according to the architecture documents contained inside the `/docs` directory.

You must treat the documents inside `/docs` as the single source of truth for:

Business Logic

Architecture

Modules

Workflows

Data Relationships

Future Expansion

Do not redesign the system.

Do not invent conflicting structures.

Do not simplify features without strong technical justification.

Instead, translate the documented architecture into production-ready code.

---

# PROJECT OVERVIEW

InWoice is not an invoice generator.

InWoice is a Business Operating System.

The platform initially serves Stix N Vibes, a sticker business, but has been architected to evolve into a multi-business business management platform.

The core purpose of the system is to manage:

Customers

Products

Sticker Packs

Invoices

PDF Documents

Payments

Revenue Tracking

Business Analytics

AI Insights

Workflow Automation

Business Intelligence

The system must remain scalable for future:

CRM

AI Agents

Marketplace

Plugin System

SaaS Expansion

Multi-Tenant Architecture

---

# DOCUMENTATION SOURCE OF TRUTH

Before implementing anything:

Read and understand ALL architecture documents inside:

/docs

The architecture documents define:

System Vision

Product Architecture

Frontend Architecture

Backend Architecture

API Architecture

Invoice Architecture

PDF Architecture

CRM Architecture

Analytics Architecture

Security Architecture

Automation Architecture

Mobile Architecture

SaaS Architecture

Plugin Architecture

Platform Constitution

Every implementation decision should align with these documents.

---

# CURRENT IMPLEMENTATION GOAL

DO NOT BUILD THE ENTIRE VISION.

Implement only V1 Production Scope.

The objective is to ship a working business platform.

Focus on:

Core Operations

Revenue Generation

Business Management

Invoice Generation

Customer Management

Analytics

PDF Delivery

Email Delivery

Google Sheets Backup

Everything else should be architected but not necessarily implemented.

---

# V1 MODULES TO IMPLEMENT

## Authentication

Login

Register

JWT

Password Reset

User Profile

Roles

---

## Business Settings

Business Information

Logo Upload

Address

Email

Phone

GST

UPI Information

Bank Information

Invoice Branding

SMTP Settings

Google Sheets Settings

---

## Customer Management

Create Customer

Edit Customer

Delete Customer

Search Customer

Customer Notes

Customer History

Customer Profile

Customer Analytics

---

## Product Management

Create Product

Edit Product

Delete Product

Product Categories

Sticker Metadata

Material

Finish

Size

Pricing

---

## Pack Management

Create Pack

Edit Pack

Delete Pack

Pack Builder

Pack Analytics

Pack Pricing

---

## Invoice Management

Create Invoice

Edit Invoice

Delete Invoice

Clone Invoice

Status Tracking

Draft

Pending

Paid

Overdue

Cancelled

---

## PDF Engine

Generate PDF

Regenerate PDF

Store PDF

Download PDF

Email PDF

Version Tracking

---

## Email Engine

SMTP Configuration

Send Invoice

Send Test Email

Delivery Logs

---

## Google Sheets Sync

Invoice Sheet

Sales Sheet

Manual Sync

Retry Sync

Sync Logs

---

## Dashboard

Revenue

Customers

Products

Packs

Recent Activity

Outstanding Payments

Revenue Trends

---

## Analytics

Revenue Analytics

Customer Analytics

Product Analytics

Pack Analytics

Business Summary

---

# CRITICAL BUSINESS REQUIREMENTS

This platform is designed specifically for sticker businesses.

Products must support:

Sticker Type

Material

Finish

Size

Shape

Waterproof Status

Design Reference

Collections

Products should support:

Anime Collections

Gaming Collections

College Collections

Festival Collections

Creator Collections

Corporate Collections

Custom Orders

---

# INVOICE REQUIREMENTS

Invoices must support:

Business Branding

Logo

Business Information

Customer Information

Product Lines

Pack Lines

Discounts

Taxes

Shipping

Notes

UPI QR Code

Bank Details

Terms

Thank You Message

The invoice should look professional and printable.

A4 Optimized.

---

# CRITICAL PDF REQUIREMENT

The database record is the source of truth.

PDF files are generated artifacts.

If a PDF is deleted:

The invoice record must remain.

The user must be able to click:

Regenerate PDF

And generate a completely new PDF without creating duplicate invoice records.

This is a core platform feature.

---

# DATABASE REQUIREMENTS

Use PostgreSQL.

Use Prisma ORM.

Design for future multi-tenancy.

All entities should be structured in a scalable way.

Expected tables include:

users

business_settings

customers

products

packs

pack_items

invoices

invoice_items

payments

files

activities

analytics_snapshots

sync_logs

email_logs

---

# BACKEND REQUIREMENTS

Use:

Node.js

Express

TypeScript

Prisma

JWT

Zod

Bcrypt

Multer

Nodemailer

Puppeteer

Organize backend into:

controllers

routes

services

validators

middleware

workers

integrations

utils

types

---

# FRONTEND REQUIREMENTS

Use:

React

TypeScript

Vite

Tailwind

shadcn/ui

TanStack Table

React Hook Form

Zod

Axios

Frontend should feel:

Modern

Fast

Minimal

Professional

Business-Focused

Not like traditional accounting software.

---

# USER EXPERIENCE REQUIREMENTS

A user should be able to:

Create Customer

↓

Create Invoice

↓

Generate PDF

↓

Send Email

↓

Sync Sheets

Within 2 minutes.

Every workflow should minimize clicks.

---

# AI IMPLEMENTATION

For V1:

Implement AI as an assistant only.

Allow:

Business Summary

Revenue Summary

Customer Summary

Top Products

Top Packs

Basic Recommendations

Do not implement:

AI Workforce

Autonomous Agents

Marketplace AI

Advanced Agent Systems

These belong to future versions.

---

# OUT OF SCOPE

Do not build:

Marketplace

Plugin Store

Developer Platform

Affiliate System

Creator Economy

Multi-Tenant SaaS

Enterprise Governance

Advanced Accounting

Inventory Management

These have already been architected but should remain future modules.

---

# IMPLEMENTATION PRIORITY ORDER

Phase 1

Authentication

Business Settings

Customers

Products

Packs

---

Phase 2

Invoices

Invoice Items

Payments

PDF Engine

---

Phase 3

Email System

Google Sheets Sync

File Management

---

Phase 4

Dashboard

Analytics

Business Intelligence

---

Phase 5

AI Assistant

Recommendations

Business Summaries

---

# DEVELOPMENT PRINCIPLES

Keep architecture clean.

Keep services modular.

Keep database normalized.

Avoid technical debt.

Avoid premature optimization.

Write scalable code.

Follow architecture documents.

Every major implementation decision should be traceable back to the architecture documentation.

---

# FINAL OBJECTIVE

Build a production-ready version of InWoice that allows Stix N Vibes to:

Manage Customers

Manage Products

Manage Packs

Generate Professional Invoices

Generate PDFs

Regenerate PDFs

Email Customers

Track Revenue

View Analytics

Store Business Data

Operate from a single centralized platform

while maintaining a clean architecture that can later evolve into the complete Business Operating System described throughout the documentation suite.
