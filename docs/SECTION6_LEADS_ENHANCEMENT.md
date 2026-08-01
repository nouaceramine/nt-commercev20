# Section 6: Leads Management Enhancement

## Overview

Advanced lead management module for NT Commerce v16. Extends basic leads CRUD with scoring, distribution, campaigns, conversion tracking, team performance analytics, and automated follow-ups.

## Files

- `backend/routes/ecom/enhanced_leads_routes.py` - 32 endpoints, ~1080 lines
- `backend/utils/enhanced_leads_indexes.py` - MongoDB indexes (4 collections, 9 indexes)

## Endpoints

### Lead Scoring (2 endpoints)
- `PUT /api/v2/leads/{id}/score` - Manual score update (0-100)
- `POST /api/v2/leads/{id}/score/auto` - Auto-calculate score based on rules

### Lead Assignment & Distribution (3 endpoints)
- `PUT /api/v2/leads/{id}/assign` - Assign to sales rep
- `GET /api/v2/leads/distribution/rules` - List distribution rules
- `POST /api/v2/leads/distribution/rules` - Create auto-distribution rule

### Lead Campaigns (5 endpoints)
- `POST /api/v2/leads/campaigns` - Create campaign
- `GET /api/v2/leads/campaigns` - List with stats
- `GET /api/v2/leads/campaigns/{id}` - Details with leads
- `PUT /api/v2/leads/campaigns/{id}` - Update
- `DELETE /api/v2/leads/campaigns/{id}` - Deactivate

### Lead Conversion (1 endpoint)
- `POST /api/v2/leads/{id}/convert` - Convert to customer or order

### Lead Notes & Timeline (3 endpoints)
- `POST /api/v2/leads/{id}/notes` - Add note with follow-up reminder
- `GET /api/v2/leads/{id}/notes` - List notes
- `GET /api/v2/leads/{id}/timeline` - Unified timeline

### Lead Tags & Follow-ups (3 endpoints)
- `POST /api/v2/leads/{id}/tags` - Add tags
- `DELETE /api/v2/leads/{id}/tags/{tag}` - Remove tag
- `GET /api/v2/leads/follow-ups/pending` - Pending follow-ups

### Advanced Search (1 endpoint)
- `POST /api/v2/leads/search/advanced` - Multi-filter search

### Bulk Operations (2 endpoints)
- `POST /api/v2/leads/bulk/update` - Bulk update (status, assignee, tags)
- `POST /api/v2/leads/bulk/assign` - Bulk assign

### Lead Analytics (4 endpoints)
- `GET /api/v2/leads/analytics/overview` - Dashboard overview
- `GET /api/v2/leads/analytics/funnel` - Conversion funnel
- `GET /api/v2/leads/analytics/performance` - Team performance
- `GET /api/v2/leads/analytics/campaigns` - Campaign ROI

### Lead Status (2 endpoints)
- `PUT /api/v2/leads/{id}/status` - Update with history
- `GET /api/v2/leads/sources/list` - Source breakdown

### Additional (6 endpoints)
- `GET /api/v2/leads/{id}/activity` - Activity log
- `PUT /api/v2/leads/{id}/reassign` - Reassign lead
- `GET /api/v2/leads/analytics/trends` - Daily trends
- `POST /api/v2/leads/{id}/duplicate` - Mark as duplicate
- `GET /api/v2/leads/dashboard/summary` - Quick summary + hot leads
- `DELETE /api/v2/leads/{id}/notes/{note_id}` - Delete note

## Lead Statuses
`new` → `contacted` → `qualified` → `proposal_sent` → `negotiating` → `converted` | `lost` | `archived`

## Auto-Scoring Rules
- **Source quality** (0-30): referral=30, whatsapp=25, website=20, facebook=15
- **Data completeness** (0-30): phone, email, message, name
- **Engagement** (0-20): based on interaction count
- **Status bonus** (0-20): converted=20, proposal_sent=20, qualified=15

## Deployment

Built and deployed on VPS 168.231.81.154 as part of NT Commerce v16.
