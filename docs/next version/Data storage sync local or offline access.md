# INWOICE - DATA STORAGE, SYNC & OFFLINE-FIRST ARCHITECTURE DOCUMENT

## Introduction

This document defines how data is stored, synchronized, backed up, cached, recovered, and accessed throughout the InWoice ecosystem.

The purpose of this architecture is to ensure that business operations continue regardless of internet connectivity, device changes, system failures, or external service outages.

Data is the most valuable asset within InWoice.

Invoices can be regenerated.

Reports can be recreated.

Dashboards can be redesigned.

But business data cannot be lost.

This architecture therefore treats data reliability, synchronization, and recoverability as first-class system requirements.

---

# Data Philosophy

The core philosophy of InWoice data management is:

Data should exist once.

Data should be available everywhere.

Data should never be lost.

Data should remain usable offline.

Data should remain recoverable.

Data should become more valuable over time.

Every architectural decision within this document supports these principles.

---

# Storage Architecture Overview

InWoice uses a multi-layer storage model.

Each storage layer serves a specific purpose.

Primary Database

↓

Local Database

↓

Cache Layer

↓

Cloud Backup Layer

↓

Archive Layer

---

# Storage Layers

The system consists of five storage layers.

---

## Layer 1 - Primary Business Database

### Purpose

Acts as the source of truth.

Stores all business-critical information.

---

### Technology

PostgreSQL

---

### Stores

Organizations

Users

Customers

Invoices

Invoice Items

Products

Packs

Payments

Expenses

Tasks

Campaigns

AI Memory

Analytics Snapshots

Audit Logs

System Settings

---

### Responsibilities

Transactional integrity

Relationship management

Query execution

Business reporting

Long-term storage

---

### Long-Term Vision

Every operational record should eventually exist within PostgreSQL.

This remains the primary truth source.

---

# Layer 2 - Local Offline Database

### Purpose

Allow business operations without internet connectivity.

---

### Technology

SQLite

Future Mobile Databases

---

### Stores

Recent Invoices

Recent Customers

Recent Products

Recent Packs

Recent Tasks

User Preferences

Sync Queue

Draft Records

Cached Reports

---

### Responsibilities

Offline invoice creation

Offline customer access

Offline search

Offline report viewing

Offline drafting

---

### Long-Term Vision

A business owner should be able to operate the platform entirely offline.

Synchronization occurs later.

---

# Layer 3 - Cache Layer

### Purpose

Improve speed and responsiveness.

---

### Technologies

Redis

Memory Cache

Browser Cache

---

### Stores

Dashboard Metrics

Frequently Accessed Customers

Recent Invoices

Popular Products

PDF Metadata

Analytics Snapshots

Search Results

AI Responses

---

### Benefits

Faster loading

Reduced database pressure

Improved user experience

Reduced AI costs

---

# Layer 4 - Cloud Backup Layer

### Purpose

Secondary storage and disaster recovery.

---

### Providers

Google Sheets

Google Drive

Cloud Storage

Future S3

Future R2

---

### Responsibilities

Invoice backups

Customer backups

Product backups

Expense backups

Analytics exports

Recovery support

---

### Long-Term Vision

Cloud backups provide redundancy without replacing the primary database.

---

# Layer 5 - Archive Layer

### Purpose

Long-term historical preservation.

---

### Stores

Old Invoices

Historical Reports

Archived Campaigns

Archived Tasks

Legacy AI Data

Historical Analytics

---

### Benefits

Reduced database load

Long-term business history

Audit support

Recovery support

---

# Offline First Architecture

## Purpose

Ensure business continuity.

The platform should remain operational even when internet access is unavailable.

---

## Offline Capabilities

Create invoices

Edit invoices

Search customers

Create customers

Access products

Build packs

View reports

Create expenses

Create tasks

Generate drafts

---

## Offline Workflow

User Creates Record

↓

Record Stored Locally

↓

Sync Queue Created

↓

Internet Restored

↓

Sync Engine Processes Queue

↓

Cloud Updated

↓

Confirmation Generated

---

## Benefits

No business interruption

Improved reliability

Field usability

Mobile usability

Travel usability

---

# Sync Engine Architecture

## Purpose

Keep all storage layers consistent.

---

## Responsibilities

Queue Management

Conflict Resolution

Retry Logic

Failure Recovery

Data Validation

Status Tracking

---

## Sync Types

Real-Time Sync

Scheduled Sync

Manual Sync

Background Sync

Recovery Sync

---

## Sync Sources

Invoices

Customers

Products

Packs

Expenses

Tasks

Campaigns

Settings

---

# Sync Queue Architecture

## Purpose

Track pending operations.

---

## Queue Structure

Queue ID

Entity Type

Entity ID

Action Type

Created Time

Status

Retry Count

Priority

---

## Statuses

Pending

Processing

Completed

Failed

Retrying

Cancelled

---

## Benefits

Reliable synchronization

Error recovery

Offline support

System transparency

---

# Conflict Resolution Architecture

## Purpose

Handle multiple versions of the same record.

---

## Scenarios

Offline Edits

Multiple Devices

Sync Delays

Import Conflicts

External Updates

---

## Resolution Rules

Newest Change Wins

Manual Review

Merge Strategy

Admin Approval

AI Assisted Resolution

---

## Long-Term Vision

Conflict handling should remain predictable and transparent.

---

# Google Sheets Sync Architecture

## Purpose

Provide external backup and reporting.

---

## Synced Entities

Invoices

Customers

Products

Expenses

Analytics

---

## Workflow

Entity Updated

↓

Sync Event Created

↓

Google Sheets Updated

↓

Sync Status Logged

---

## Benefits

External visibility

Business reporting

Disaster recovery

Manual exports

---

# File Storage Architecture

## Purpose

Manage documents and assets.

---

## Stored Files

PDF Invoices

Receipts

Product Images

Pack Images

Customer Documents

Campaign Assets

Reports

---

## Providers

Google Drive

Cloud Storage

Future S3

Future R2

---

## Metadata Stored

File ID

File Name

Storage Path

Owner

Entity Reference

Upload Date

File Type

Version

---

# PDF Storage Architecture

## Purpose

Manage invoice documents.

---

## Philosophy

Invoices should be regeneratable.

PDFs should not be the source of truth.

Invoice Data remains primary.

PDFs remain generated artifacts.

---

## Workflow

Invoice Data

↓

PDF Generation

↓

Storage

↓

Download

↓

Regeneration Available Anytime

---

## Benefits

Reduced storage

Version flexibility

Template flexibility

Future-proofing

---

# Search Storage Architecture

## Purpose

Provide fast information retrieval.

---

## Search Sources

Invoices

Customers

Products

Packs

Tasks

Campaigns

Communications

Reports

---

## Search Modes

Keyword Search

Structured Search

Semantic Search

AI Search

Natural Language Search

---

## Long-Term Vision

Search becomes the primary navigation system.

---

# AI Memory Storage Architecture

## Purpose

Store organizational knowledge.

---

## Memory Sources

Customers

Invoices

Products

Packs

Expenses

Campaigns

Tasks

Communications

Analytics

---

## Stored Objects

Insights

Patterns

Recommendations

Forecasts

Customer Signals

Business Signals

---

## Long-Term Goal

Allow AI to accumulate business intelligence over years of operation.

---

# Analytics Storage Architecture

## Purpose

Preserve historical metrics.

---

## Stored Metrics

Revenue

Profit

Expenses

Customers

Products

Campaigns

Tasks

AI Scores

---

## Benefits

Historical analysis

Trend analysis

Forecasting

Growth tracking

---

# Backup Architecture

## Purpose

Guarantee recoverability.

---

## Backup Layers

Primary Database

Local Database

Google Sheets

Cloud Storage

Manual Exports

---

## Recovery Sources

Database Backups

Cloud Backups

Sheets Exports

Archived Data

File Storage

---

# Data Lifecycle Management

## Purpose

Control information growth.

---

## Lifecycle Stages

Created

↓

Active

↓

Historical

↓

Archived

↓

Recoverable

---

## Benefits

Performance

Compliance

Cost Management

Maintainability

---

# Long-Term Vision

The final storage architecture should allow InWoice to function regardless of:

Internet outages

Device failures

Cloud outages

Database failures

User mistakes

Integration failures

Business growth

The platform should be resilient enough to support years of business activity without data loss.

---

# Final Objective

The purpose of the Data Storage, Sync & Offline-First Architecture is to ensure that business information remains:

Available

Accurate

Recoverable

Portable

Intelligent

Future-proof

Every invoice.

Every customer.

Every product.

Every payment.

Every AI insight.

Every report.

Should remain accessible, synchronized, and protected throughout the lifetime of the business.

The platform should not merely store information.

It should preserve the operational memory of the organization.
