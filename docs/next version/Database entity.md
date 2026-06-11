# INWOICE - DATABASE & ENTITY ARCHITECTURE DOCUMENT

## Introduction

This document defines the core entities of InWoice and the relationships between them.

The purpose of this document is to establish a single source of truth for all business data within the platform.

Every feature in InWoice must be built using these entities.

No module should create duplicate versions of the same information.

The database should represent how a real business operates.

---

# Data Philosophy

A business is ultimately made up of:

People

Products

Transactions

Money

Activities

Communication

Every entity in InWoice exists to model one of these categories.

The system is designed around relationships rather than isolated records.

Example:

An invoice is not simply a document.

An invoice is connected to:

A customer

Products

Payments

Accounting entries

Analytics

AI insights

Communication history

Future inventory movement

The database should reflect these relationships.

---

# Core Entity Hierarchy

The hierarchy of the system is:

Organization

↓

Users

↓

Customers

↓

Invoices

↓

Products

↓

Payments

↓

Analytics

Every other module extends this hierarchy.

---

# Organization Entity

Purpose:

Represents the business using InWoice.

Examples:

Stix N Vibes

Future Client Businesses

Fields:

Organization ID

Business Name

Logo

Address

Email

Phone

Website

GST Number

Currency

Timezone

Created Date

Updated Date

Purpose:

All business data belongs to an organization.

Future multi-business support depends on this entity.

---

# User Entity

Purpose:

Represents people using the system.

Fields:

User ID

Organization ID

Name

Email

Password Hash

Role

Profile Image

Status

Last Login

Created Date

Permissions

Roles:

Owner

Admin

Manager

Employee

Future:

Role Based Access Control

Department Access

Custom Permissions

Activity Tracking

---

# Customer Entity

Purpose:

Represents buyers and leads.

Fields:

Customer ID

Organization ID

Name

Email

Phone

Instagram Handle

Address

Notes

Total Revenue

Total Orders

Lifetime Value

Last Purchase Date

Customer Status

Created Date

Updated Date

Customer Types:

New

Regular

Loyal

VIP

At Risk

Purpose:

Customer becomes the central intelligence record for relationship management.

---

# Product Entity

Purpose:

Represents anything sold.

Examples:

Sticker

Poster

Custom Design

Merchandise

Fields:

Product ID

Organization ID

Name

Description

Category

Theme

Material

Finish

Size

Base Cost

Selling Price

SKU

Status

Created Date

Updated Date

Purpose:

All revenue generating items should exist here.

---

# Product Category Entity

Purpose:

Classify products.

Examples:

Anime

Cafe

Motivational

Custom

Events

Seasonal

Purpose:

Analytics and reporting.

Future:

Category-level revenue tracking.

---

# Product Pack Entity

Purpose:

Represent bundled offerings.

Examples:

Anime Starter Pack

Cafe Marketing Pack

Event Pack

Fields:

Pack ID

Name

Description

Pack Price

Included Products

Discount

Status

Created Date

Purpose:

Allow bundle management independent of individual products.

Future:

Inventory integration.

---

# Invoice Entity

Purpose:

Represent a sale.

Fields:

Invoice ID

Invoice Number

Customer ID

Organization ID

Date

Due Date

Status

Subtotal

Discount

Tax

Shipping

Total

Payment Status

Payment Method

Notes

PDF Path

Created Date

Updated Date

Invoice Status:

Draft

Pending

Paid

Overdue

Cancelled

Purpose:

Core transactional record of the system.

---

# Invoice Item Entity

Purpose:

Represent products inside invoices.

Fields:

Invoice Item ID

Invoice ID

Product ID

Name Snapshot

Quantity

Unit Price

Discount

Line Total

Purpose:

Preserve historical accuracy.

Even if a product changes later.

---

# Payment Entity

Purpose:

Track money received.

Fields:

Payment ID

Invoice ID

Customer ID

Amount

Method

Reference Number

Date

Status

Notes

Methods:

UPI

Cash

Bank Transfer

Card

PayPal

Stripe

Future:

Partial Payments

Split Payments

Subscriptions

---

# Expense Entity

Purpose:

Track outgoing money.

Fields:

Expense ID

Organization ID

Category

Description

Amount

Vendor

Payment Method

Date

Receipt Image

Created Date

Purpose:

Profit calculations.

GST calculations.

Financial reporting.

---

# Ledger Entry Entity

Purpose:

Support accounting system.

Fields:

Entry ID

Reference Type

Reference ID

Debit Account

Credit Account

Amount

Date

Notes

Purpose:

Double-entry bookkeeping.

Financial accuracy.

---

# Task Entity

Purpose:

Operational management.

Fields:

Task ID

Title

Description

Priority

Status

Due Date

Assigned User

Created Date

Purpose:

Business execution.

---

# Marketing Campaign Entity

Purpose:

Track campaigns.

Fields:

Campaign ID

Name

Type

Audience

Start Date

End Date

Cost

Revenue Generated

Status

Purpose:

Marketing ROI tracking.

---

# Feedback Entity

Purpose:

Store customer reviews.

Fields:

Feedback ID

Customer ID

Rating

Review

Date

Source

Purpose:

Customer satisfaction tracking.

---

# Communication Entity

Purpose:

Store customer interactions.

Fields:

Communication ID

Customer ID

Channel

Message

Date

Direction

Purpose:

Central communication history.

Channels:

Email

WhatsApp

Instagram

Phone

Future:

Unified Inbox

---

# AI Memory Entity

Purpose:

Store AI-generated knowledge.

Fields:

Memory ID

Entity Type

Entity ID

Insight

Confidence Score

Created Date

Purpose:

Allow AI to build business understanding over time.

---

# Analytics Snapshot Entity

Purpose:

Store business metrics.

Fields:

Snapshot ID

Date

Revenue

Expenses

Profit

Invoices

New Customers

Returning Customers

Purpose:

Historical analytics.

Forecasting.

Trend analysis.

---

# Relationship Model

Organization owns:

Users

Customers

Products

Packs

Invoices

Expenses

Tasks

Campaigns

Customers create:

Invoices

Payments

Communications

Feedback

Invoices contain:

Invoice Items

Payments

Ledger Entries

Products belong to:

Categories

Packs

Invoices

Analytics reads:

Everything

AI reads:

Everything

This makes Analytics and AI system-wide intelligence layers rather than isolated modules.

---

# Long-Term Vision

The database should eventually evolve into a complete business knowledge graph.

Every customer.

Every product.

Every invoice.

Every payment.

Every conversation.

Every campaign.

Every task.

Every AI insight.

Should be interconnected.

The goal is not simply to store information.

The goal is to create a system capable of understanding how the business operates.
