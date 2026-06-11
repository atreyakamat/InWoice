# INWOICE - DATA MODEL & DATABASE SCHEMA MASTER ARCHITECTURE DOCUMENT

## Introduction

This document defines the master data architecture of InWoice.

This is the most important technical document in the entire platform because every module ultimately depends on data relationships.

Invoices depend on Customers.

Customers depend on Organizations.

Payments depend on Invoices.

Products depend on Categories.

Analytics depend on all modules.

AI depends on all business data.

The purpose of this document is to define the complete data model before implementation begins.

This document acts as the blueprint for:

PostgreSQL

Prisma Schema

Database Migrations

API Contracts

Service Architecture

AI Memory

Analytics Engine

Future SaaS Expansion

Every future table should originate from this document.

---

# Database Design Philosophy

The database should be:

Normalized

Scalable

Auditable

Extensible

Multi-Tenant Ready

AI Ready

Analytics Ready

Future Proof

The database should support:

10 invoices

10 million invoices

Without requiring structural redesign.

---

# Entity Hierarchy

The highest level hierarchy should be:

Platform

↓

Organization

↓

Workspace (Future)

↓

Users

↓

Business Data

---

# Core Database Domains

The database is divided into:

Organization Domain

Authentication Domain

Customer Domain

Commerce Domain

Invoice Domain

Financial Domain

CRM Domain

Analytics Domain

AI Domain

Automation Domain

System Domain

---

# Organization Domain

## organizations

Represents a business.

---

### Fields

id

name

slug

industry

email

phone

address

country

currency

timezone

gst_number

subscription_plan

logo_url

created_at

updated_at

status

---

### Relationships

Organization

→ Users

→ Customers

→ Products

→ Packs

→ Invoices

→ Expenses

→ Analytics

---

## Why

Every record belongs to an organization.

This is the foundation of SaaS scalability.

---

# Authentication Domain

## users

Represents platform users.

---

### Fields

id

organization_id

first_name

last_name

email

password_hash

phone

avatar_url

role_id

status

last_login

created_at

updated_at

---

## roles

Represents permission groups.

---

### Fields

id

name

description

organization_id

created_at

---

## permissions

Represents individual actions.

---

### Examples

create_invoice

edit_invoice

delete_invoice

view_reports

manage_users

---

## role_permissions

Maps permissions to roles.

---

## user_sessions

Tracks active sessions.

---

### Benefits

Security

Auditability

RBAC

---

# Customer Domain

## customers

Represents business customers.

---

### Fields

id

organization_id

customer_code

name

email

phone

whatsapp

instagram

address

city

state

country

notes

source

segment

health_score

created_at

updated_at

---

## customer_notes

Stores internal notes.

---

## customer_tags

Stores tags.

---

## customer_timeline

Stores customer events.

---

### Example Events

Invoice Created

Payment Received

Campaign Sent

Task Assigned

---

## customer_segments

Stores segment definitions.

---

### Examples

VIP

Regular

Loyal

Dormant

At Risk

---

# Commerce Domain

## product_categories

---

### Examples

Anime

Gaming

Business

Festival

Custom

---

## collections

---

### Examples

Anime Collection

Creator Collection

College Collection

---

## products

Represents sellable items.

---

### Fields

id

organization_id

category_id

collection_id

sku

name

description

price

cost

status

tags

created_at

updated_at

---

## product_media

Stores images and assets.

---

## product_pricing

Supports future pricing models.

---

## packs

Represents bundles.

---

### Fields

id

organization_id

name

description

price

cost

status

version

created_at

---

## pack_items

Links products to packs.

---

### Relationship

Pack

→ Multiple Products

---

# Invoice Domain

## invoices

Core business table.

---

### Fields

id

organization_id

customer_id

invoice_number

status

subtotal

discount

tax

shipping

total

payment_status

notes

issue_date

due_date

created_by

created_at

updated_at

---

## invoice_items

Stores line items.

---

### Fields

invoice_id

product_id

description

quantity

unit_price

discount

tax

total

---

## invoice_history

Tracks changes.

---

### Benefits

Auditability

Version Tracking

Regeneration

---

## invoice_templates

Stores branding templates.

---

## invoice_files

Stores generated PDFs.

---

# Payment Domain

## payments

Tracks payment activity.

---

### Fields

id

invoice_id

customer_id

amount

method

reference

status

paid_at

notes

created_at

---

## payment_methods

---

### Examples

UPI

Cash

Bank Transfer

Stripe

PayPal

---

## refunds

Future support.

---

# Financial Domain

## expenses

Tracks outgoing money.

---

### Fields

id

organization_id

category_id

amount

description

vendor

receipt_url

expense_date

created_at

---

## expense_categories

---

### Examples

Printing

Marketing

Software

Packaging

Shipping

---

## ledger_entries

Double entry accounting.

---

## accounts

Chart of accounts.

---

## tax_records

GST and tax tracking.

---

# CRM Domain

## communications

Tracks conversations.

---

### Channels

Email

WhatsApp

Instagram

Phone

---

## leads

Future lead tracking.

---

## campaigns

Marketing campaigns.

---

## campaign_recipients

Tracks delivery.

---

## referrals

Tracks customer referrals.

---

# Inventory Domain

(Future)

## inventory_items

## inventory_movements

## suppliers

## warehouses

## purchase_orders

---

# Task Domain

## tasks

---

### Fields

id

title

description

status

priority

assigned_to

created_by

due_date

created_at

---

## task_comments

## task_activity

---

# Analytics Domain

## analytics_snapshots

Stores calculated metrics.

---

### Examples

Revenue

Profit

Retention

Growth

---

## business_scores

Stores health scores.

---

### Examples

Business Health

Customer Health

Product Health

---

## forecasts

Stores future projections.

---

## insights

Stores AI-generated insights.

---

# AI Domain

## ai_conversations

Stores AI interactions.

---

## ai_memory

Stores learned business context.

---

### Examples

Best Customers

Popular Products

Growth Patterns

Seasonal Trends

---

## ai_recommendations

Stores generated recommendations.

---

## ai_actions

Tracks AI-generated actions.

---

# Automation Domain

## workflows

Stores automation workflows.

---

## workflow_triggers

---

### Examples

Invoice Paid

Customer Created

Campaign Completed

---

## workflow_actions

---

### Examples

Send Email

Create Task

Generate Report

---

## workflow_logs

Tracks execution history.

---

# Storage Domain

## files

Stores uploaded files.

---

### Fields

id

organization_id

entity_type

entity_id

file_name

file_url

file_size

mime_type

created_at

---

# Audit Domain

## audit_logs

Tracks everything.

---

### Fields

id

user_id

organization_id

action

entity_type

entity_id

old_value

new_value

ip_address

created_at

---

## Benefits

Compliance

Recovery

Security

Transparency

---

# Notification Domain

## notifications

Stores alerts.

---

### Types

System

AI

Invoices

Payments

Tasks

Campaigns

Inventory

---

# Settings Domain

## settings

Organization settings.

---

## branding_settings

Invoice branding.

---

## integration_settings

API credentials.

---

## ai_settings

AI configuration.

---

# Indexing Strategy

High priority indexes:

organization_id

customer_id

invoice_number

email

phone

created_at

status

payment_status

sku

---

## Benefits

Fast searches

Scalable analytics

Efficient reporting

---

# Soft Delete Strategy

Important records should never be permanently deleted.

---

### Use

deleted_at

deleted_by

---

### Applicable Tables

Invoices

Customers

Products

Packs

Payments

Tasks

---

## Benefits

Recovery

Auditability

Data Integrity

---

# Multi-Tenant Isolation Strategy

Every business table must include:

organization_id

---

### Benefits

Tenant Isolation

Security

Scalability

Future SaaS Support

---

# Future Expansion Ready Entities

Future modules can be added without redesign.

Examples:

Subscriptions

Inventory

Warehouses

Affiliate Programs

Creator Marketplace

Storefront CMS

Event Management

Print Production

Shipping

Procurement

---

# Long-Term Vision

This database should eventually support:

Thousands of Organizations

Millions of Customers

Millions of Invoices

Millions of Products

Billions of Events

AI Business Intelligence

Enterprise Operations

Without requiring fundamental restructuring.

The schema should become the permanent foundation of the InWoice ecosystem.

---

# Final Objective

The Data Model & Database Schema Master Architecture exists to provide a single source of truth for the entire platform.

Every module.

Every service.

Every report.

Every automation.

Every AI capability.

Depends on this foundation.

The database should not simply store records.

It should preserve the operational memory of every business using InWoice.

This document serves as the master blueprint from which Prisma schemas, migrations, APIs, services, analytics engines, AI memory systems, and future platform capabilities are built.
