# INWOICE - API & SERVICE ARCHITECTURE DOCUMENT

## Introduction

This document defines the backend architecture of InWoice.

The purpose of this architecture is to create a scalable, maintainable, secure, and modular backend capable of supporting all current and future modules within the platform.

The backend should not be viewed as a collection of routes.

The backend should be viewed as a collection of business services.

Each service owns a specific business responsibility and communicates with other services through defined interfaces and events.

This approach ensures that InWoice remains maintainable as new modules are added.

---

# Backend Philosophy

The backend exists to enforce business rules.

The frontend exists to display information.

Business logic should never live in the frontend.

Business logic should never be duplicated.

Every important operation should pass through a centralized service layer.

This ensures consistency, security, traceability, and scalability.

---

# Backend Layer Architecture

The backend is divided into seven layers.

Request Layer

↓

Validation Layer

↓

Authentication Layer

↓

Controller Layer

↓

Service Layer

↓

Event Layer

↓

Data Layer

Each layer has a specific responsibility.

---

# Request Layer

## Purpose

Receive incoming requests from clients.

---

## Sources

Web Dashboard

Mobile Applications

Public APIs

Webhooks

Future Desktop Applications

Future Browser Extensions

AI Interfaces

---

## Responsibilities

Request Handling

Rate Limiting

Request Logging

Request Parsing

Security Checks

---

# Validation Layer

## Purpose

Ensure data integrity.

---

## Technology

Zod

TypeScript Types

Custom Validators

---

## Responsibilities

Schema Validation

Field Validation

Business Rule Validation

Payload Sanitization

Type Checking

---

## Example

Invoice Request

↓

Validate Customer

↓

Validate Products

↓

Validate Pricing

↓

Validate Taxes

↓

Continue Processing

---

# Authentication Layer

## Purpose

Verify user identity.

---

## Technologies

JWT

Bcrypt

Session Validation

Future OAuth

Future SSO

---

## Responsibilities

Login

Logout

Token Validation

Session Management

Permission Checks

---

# Authorization Layer

## Purpose

Control access.

---

## Responsibilities

Role Checks

Permission Checks

Organization Isolation

Module Access Validation

Action Validation

---

## Example

Employee

↓

Can Create Invoice

↓

Cannot Delete Invoice

---

# Controller Layer

## Purpose

Act as entry points into business services.

Controllers should remain thin.

Controllers should not contain business logic.

---

## Responsibilities

Receive Request

Call Service

Return Response

Handle Errors

---

## Example

InvoiceController

CustomerController

ProductController

AnalyticsController

AIController

TaskController

MarketingController

---

# Service Layer

## Purpose

Contain all business logic.

This is the heart of the backend.

---

## Service Philosophy

Every module owns a service.

All business operations happen inside services.

---

# Invoice Service

## Responsibilities

Create Invoice

Update Invoice

Delete Invoice

Clone Invoice

Generate PDF

Regenerate PDF

Send Invoice

Update Status

Calculate Totals

Generate Payment Links

---

## Related Services

Customer Service

PDF Service

Email Service

Analytics Service

Accounting Service

Sync Service

---

# Customer Service

## Responsibilities

Create Customer

Update Customer

Segment Customer

Calculate LTV

Generate Insights

Manage Communication History

---

## Related Services

CRM Service

Analytics Service

Marketing Service

AI Service

---

# Product Service

## Responsibilities

Create Products

Manage Pricing

Manage Categories

Manage Themes

Manage Metadata

Track Product Usage

---

# Pack Service

## Responsibilities

Create Packs

Manage Pack Contents

Manage Versions

Calculate Pack Pricing

Track Pack Performance

---

# Accounting Service

## Responsibilities

Create Ledger Entries

Track Revenue

Track Expenses

Generate Reports

Calculate Profit

Handle Reconciliation

---

# Analytics Service

## Responsibilities

Aggregate Data

Calculate Metrics

Generate Reports

Generate Forecasts

Create Snapshots

---

# AI Service

## Responsibilities

Model Routing

Prompt Construction

Context Retrieval

Memory Storage

Insight Generation

Forecasting

Recommendation Generation

---

## Providers

Grok

Gemini

Ollama

Python Services

Future Providers

---

# Marketing Service

## Responsibilities

Campaign Management

Audience Management

Email Campaigns

WhatsApp Campaigns

Performance Tracking

---

# Task Service

## Responsibilities

Task Creation

Task Assignment

Task Tracking

Task Reporting

---

# Communication Service

## Responsibilities

Email

WhatsApp

Notifications

Reminders

Message Logging

---

# PDF Service

## Purpose

Generate business documents.

---

## Responsibilities

Invoice PDFs

Reports

Exports

Templates

Document Rendering

---

## Technologies

Puppeteer

HTML Templates

Future Template Engine

---

# Email Service

## Purpose

Manage outbound communications.

---

## Responsibilities

SMTP Delivery

Template Management

Tracking

Campaign Sending

Follow-Ups

---

# Sync Service

## Purpose

Synchronize external systems.

---

## Responsibilities

Google Sheets Sync

Offline Sync

Backup Sync

Import Processing

Conflict Resolution

---

# Storage Service

## Purpose

Manage files.

---

## Responsibilities

Upload

Download

Versioning

Metadata

File Relationships

---

# Event Layer

## Purpose

Enable module communication.

Modules should communicate through events rather than direct dependencies whenever possible.

---

# Event Philosophy

Business Event

↓

Published

↓

Interested Services React

↓

Actions Executed

---

## Example

Invoice Created

↓

Customer Updated

↓

Accounting Updated

↓

Analytics Updated

↓

AI Memory Updated

↓

Google Sheets Updated

↓

Notifications Sent

---

# Core Event Types

InvoiceCreated

InvoiceUpdated

InvoicePaid

CustomerCreated

CustomerUpdated

PaymentReceived

ExpenseRecorded

TaskCreated

CampaignCreated

PackPurchased

InsightGenerated

---

# Event Bus

## Purpose

Central event routing.

---

## Responsibilities

Publish Events

Subscribe Services

Retry Failures

Audit Events

Monitor Event Health

---

## Long-Term Vision

Allow event-driven scalability.

---

# Webhook Architecture

## Purpose

Expose business events externally.

---

## Supported Events

Invoice Created

Invoice Paid

Customer Created

Customer Updated

Payment Received

Campaign Completed

Task Completed

---

## Workflow

Event Occurs

↓

Webhook Generated

↓

External System Notified

---

# API Architecture

## Base Structure

/api/v1

---

## Modules

/api/v1/auth

/api/v1/users

/api/v1/customers

/api/v1/products

/api/v1/packs

/api/v1/invoices

/api/v1/payments

/api/v1/expenses

/api/v1/accounting

/api/v1/tasks

/api/v1/marketing

/api/v1/analytics

/api/v1/reports

/api/v1/ai

/api/v1/settings

/api/v1/webhooks

---

# Response Architecture

## Standard Response Format

Success

Message

Data

Metadata

Errors

Timestamp

Request ID

---

## Benefits

Consistency

Debugging

Monitoring

Client Simplicity

---

# Error Handling Architecture

## Purpose

Provide predictable failures.

---

## Error Types

Validation Errors

Authentication Errors

Authorization Errors

Business Rule Errors

External Service Errors

AI Errors

Sync Errors

Database Errors

---

## Error Workflow

Error Detected

↓

Logged

↓

Categorized

↓

Response Generated

↓

Monitoring Alert Created

---

# Logging Architecture

## Purpose

Create system visibility.

---

## Log Categories

API Logs

Authentication Logs

Business Logs

Audit Logs

AI Logs

Sync Logs

Error Logs

---

## Technology

Winston

File Rotation

Future Centralized Logging

---

# Monitoring Architecture

## Purpose

Maintain platform health.

---

## Monitored Systems

API Health

Database Health

AI Providers

Sync Engine

Email Delivery

Storage Systems

Event Bus

---

# Long-Term Service Architecture Vision

The architecture should allow any service to be replaced without affecting the entire platform.

For example:

Replacing Grok with another AI provider.

Replacing PostgreSQL.

Replacing Google Sheets.

Replacing SMTP providers.

Replacing payment gateways.

The platform should remain modular and adaptable.

---

# Final Objective

The objective of the API & Service Architecture is to create a backend that is:

Scalable

Maintainable

Modular

Secure

Observable

Replaceable

Future-Proof

Every invoice.

Every customer.

Every AI insight.

Every report.

Every integration.

Should flow through clearly defined services and events.

The backend should act as the operational engine that powers the entire InWoice Business Operating System.
