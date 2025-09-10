# Room Reservation System Setup Guide

## 🚀 Quick Start (Development Mode)

You can run this application in development mode without Supabase setup:

```bash
# Install dependencies
npm install

# Run development server (uses mock data)
npm run dev

# Open browser to http://localhost:3000
```

## 📦 Production Setup with Supabase

### 1. Create Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the project to initialize

### 2. Setup Database Schema
1. Go to SQL Editor in Supabase Dashboard
2. Copy the entire contents of `db/migrations/complete_schema.sql`
3. Paste into SQL Editor and click "Run"
4. This will create all tables, indexes, triggers, RLS policies, and sample data

### 3. Configure Environment Variables
1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Get your Supabase credentials:
   - Go to Settings > API in Supabase Dashboard
   - Copy `Project URL` → `SUPABASE_URL`
   - Copy `service_role` key (secret) → `SUPABASE_SERVICE_KEY`

3. Update `.env` file:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key-here
PORT=3000
NODE_ENV=development
```

### 4. Run the Application
```bash
# Development mode
npm run dev

# Production build
npm run build
npm start
```

## 🌐 Vercel Deployment

### 1. Deploy to Vercel
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

### 2. Configure Environment Variables
In Vercel Dashboard:
1. Go to Project Settings > Environment Variables
2. Add `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
3. Redeploy to apply changes

## 🧪 Testing

### Development Testing (Mock Data)
The application automatically uses mock data when Supabase credentials are not configured. This is perfect for local development and testing.

### API Testing
```bash
# Test room availability
curl "http://localhost:3000/rooms/availability?start=2025-09-15T09:00:00Z&end=2025-09-15T11:00:00Z"

# Create a hold
curl -X POST http://localhost:3000/holds \
  -H "Content-Type: application/json" \
  -d '{"roomId": 1, "start": "2025-09-15T09:00:00Z", "end": "2025-09-15T10:00:00Z", "ttlSeconds": 300}'
```

## 📝 Database Schema Overview

### Tables
- **rooms**: Meeting room definitions
- **room_blackouts**: Blocked time periods for maintenance
- **holds**: Temporary reservations (5min TTL)
- **reservations**: Confirmed bookings
- **audit_logs**: System activity tracking

### Key Features
- PostgreSQL TSRANGE for time period management
- GIST indexes for efficient overlap queries
- Row Level Security (RLS) for data protection
- Automatic conflict detection via triggers

## 🔧 Troubleshooting

### Common Issues

**Issue**: "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY"
- **Solution**: Application will use mock data automatically. For production, configure `.env` file.

**Issue**: Supabase SQL error "data type bigint has no default operator class"
- **Solution**: Use `complete_schema.sql` which includes `CREATE EXTENSION IF NOT EXISTS btree_gist;`

**Issue**: Security Advisor warnings in Supabase
- **Solution**: RLS policies are already configured in `complete_schema.sql`

**Issue**: Date/time validation errors (400 Bad Request)
- **Solution**: Ensure dates are in ISO 8601 format with timezone (e.g., `2025-09-15T09:00:00Z`)

## 📚 API Documentation

### Endpoints

- `GET /rooms/availability` - Search available rooms
- `GET /rooms/:id/slots` - Generate time slots
- `POST /holds` - Create temporary hold
- `POST /reservations/confirm` - Confirm reservation
- `GET /reservations` - List user's reservations
- `POST /reservations/:id/cancel` - Cancel reservation

See API implementation in `src/presentation/http/server.ts` for detailed parameters.