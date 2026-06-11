# INWOICE V1 - FRONTEND SCREENS, USER FLOWS & NAVIGATION ARCHITECTURE DOCUMENT

## Introduction

This document defines the complete frontend experience of InWoice V1.

The purpose of this document is to ensure that every screen, workflow, action, and navigation path is clearly defined before implementation begins.

The frontend should not feel like accounting software.

The frontend should feel like a modern business workspace.

Every page should answer:

What am I looking at?

What can I do here?

What should I do next?

The goal is simplicity, speed, and clarity.

---

# Primary User

The initial primary user is:

Business Owner

Specifically:

Stix N Vibes Owner

However the interface should remain generic enough to support future businesses.

---

# Global Layout Architecture

Every authenticated page should follow:

Sidebar

↓

Top Navigation

↓

Page Header

↓

Actions

↓

Content

---

# Sidebar Navigation

## Main Navigation

Dashboard

Invoices

Customers

Products

Packs

Analytics

Files

AI Assistant

Settings

---

## Future Hidden Navigation

Inventory

Marketing

Tasks

Marketplace

Teams

Automation

---

# Top Navigation

## Components

Global Search

Quick Create Button

Notifications

AI Assistant Shortcut

User Profile

Settings Shortcut

---

## Quick Create Menu

Create Invoice

Create Customer

Create Product

Create Pack

---

# Login Screen

## Purpose

Authenticate users.

---

## Components

Email

Password

Remember Me

Forgot Password

Login Button

---

## Actions

Login

Reset Password

Register

---

# Register Screen

## Purpose

Create new accounts.

---

## Components

Name

Email

Password

Confirm Password

Business Name

Create Account

---

# Dashboard Screen

## Purpose

Business Overview

---

## Cards

Revenue Today

Revenue This Month

Invoices This Month

Customers

Outstanding Payments

Products

Packs

---

## Widgets

Recent Invoices

Recent Customers

Top Products

Top Packs

Revenue Trend

Activity Feed

---

## Quick Actions

Create Invoice

Create Customer

Generate Report

Ask AI

---

# Customer List Screen

## Purpose

Manage customers.

---

## Table Columns

Name

Email

Phone

Total Orders

Revenue

Last Purchase

Status

Actions

---

## Actions

View

Edit

Delete

Create Invoice

---

## Features

Search

Filter

Sort

Pagination

Export

---

# Customer Profile Screen

## Purpose

Complete customer overview.

---

## Sections

Customer Details

Purchase History

Invoices

Notes

Activity Timeline

Communication History

---

## Actions

Edit Customer

Create Invoice

Add Note

Send Email

---

# Product List Screen

## Purpose

Manage products.

---

## Table Columns

Name

Category

Price

Cost

Status

Created Date

Actions

---

## Features

Search

Filter

Sort

Export

---

## Actions

Create Product

Edit Product

Delete Product

---

# Product Detail Screen

## Sections

Product Information

Pricing

Analytics

Related Packs

History

---

## Actions

Edit

Archive

Duplicate

---

# Pack List Screen

## Purpose

Manage sticker packs.

---

## Table Columns

Name

Products

Price

Revenue

Status

Actions

---

## Features

Search

Filter

Sort

Export

---

# Pack Builder Screen

## Purpose

Create and manage packs.

---

## Components

Pack Name

Description

Pack Image

Products Selector

Pricing

Preview

---

## Actions

Save

Publish

Duplicate

Archive

---

# Invoice List Screen

## Purpose

Invoice management.

---

## Table Columns

Invoice Number

Customer

Amount

Status

Issue Date

Due Date

Actions

---

## Features

Search

Filter

Status Filter

Date Filter

Export

Bulk Actions

---

# Invoice Creation Screen

## Purpose

Generate invoices.

---

## Step 1

Select Customer

---

## Step 2

Add Products

or

Add Pack

---

## Step 3

Apply

Discount

Tax

Shipping

Notes

---

## Step 4

Invoice Preview

---

## Step 5

Generate Invoice

---

## Output

PDF

Email

Google Sheets Sync

---

# Invoice Detail Screen

## Sections

Invoice Information

Customer

Items

Payments

History

PDF Preview

---

## Actions

Download PDF

Send Email

Clone

Regenerate PDF

Mark Paid

Delete

---

# Invoice PDF Preview Modal

## Purpose

Preview before sending.

---

## Actions

Download

Send Email

Regenerate

Close

---

# Analytics Screen

## Purpose

Business insights.

---

## Sections

Revenue Analytics

Customer Analytics

Product Analytics

Pack Analytics

---

## Charts

Revenue Trend

Top Products

Top Packs

Customer Growth

Monthly Performance

---

# Files Screen

## Purpose

Manage generated documents.

---

## Sections

Invoices

PDFs

Exports

Uploads

---

## Actions

View

Download

Delete

Search

---

# AI Assistant Screen

## Purpose

Business intelligence.

---

## Components

Chat Interface

Suggested Questions

Conversation History

---

## Example Questions

What were my best-selling packs?

Who are my top customers?

How much revenue did I make this month?

Which products are growing fastest?

---

## Outputs

Insights

Reports

Recommendations

Summaries

---

# Settings Screen

## Purpose

Business configuration.

---

## Sections

Business Information

Invoice Branding

Email Settings

Google Sheets Settings

AI Settings

User Settings

---

# Business Information Tab

Business Name

Logo

Address

Phone

Email

GST Number

Website

---

# Invoice Branding Tab

Logo

Primary Color

Footer Text

Terms

UPI Information

Bank Information

---

# Email Settings Tab

SMTP Host

SMTP Port

Username

Password

Test Email Button

---

# Google Sheets Settings Tab

Spreadsheet ID

Sheet Names

Sync Status

Reconnect Button

---

# AI Settings Tab

Provider

API Key

Model

Preferences

---

# Search Architecture

## Global Search

Searches:

Customers

Products

Packs

Invoices

---

## Results

Grouped by entity.

---

# Notification Drawer

## Categories

Invoices

Payments

Customers

System

AI

---

## Actions

Open

Mark Read

Clear

---

# Mobile Experience

## Priority Screens

Dashboard

Create Invoice

Customers

Invoices

AI Assistant

---

## Goal

Business owner should be able to create an invoice within 60 seconds on mobile.

---

# Empty States

Every page must include:

Explanation

Call To Action

Helpful Guidance

---

## Example

No Invoices Found

Create your first invoice to start tracking sales.

[Create Invoice]

---

# Error States

Every page must include:

Error Description

Retry Button

Support Action

---

# Loading States

Use skeleton loaders.

Never show blank screens.

---

# Keyboard Shortcuts

## Future

Ctrl + K

Global Search

---

N

New Invoice

---

C

New Customer

---

P

New Product

---

# User Journey

Login

↓

Dashboard

↓

Customer

↓

Invoice

↓

PDF

↓

Email

↓

Analytics

↓

AI Insights

This should feel seamless.

---

# Final Objective

The frontend should enable a business owner to manage their entire invoicing workflow with minimal effort.

Every screen should reduce friction.

Every workflow should reduce clicks.

Every action should be obvious.

The ultimate goal is for a user to move from customer creation to invoice delivery in under two minutes while maintaining complete visibility into their business performance.
