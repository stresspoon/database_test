# Room Reservation System

A minimal room reservation system built with TypeScript, Express, and Supabase PostgreSQL.

## Architecture

```
Presentation (HTTP API) → Business Logic (BookingService) → Data (SupabaseClient) → PostgreSQL
```

### Components

- **HTTP API** (`src/presentation/http/server.ts`): REST endpoints with Zod validation
- **BookingService** (`src/domain/BookingService.ts`): Core business logic and rules
- **SupabaseClient** (`src/data/supabaseClient.ts`): Database access layer
- **Database** (`db/migrations/`): PostgreSQL schema with TSRANGE for time management

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your Supabase credentials
   ```

3. **Run migrations:**
   Apply the SQL migrations in `db/migrations/` to your Supabase database:
   - `0001_init.sql`: Create tables and indexes
   - `0002_triggers.sql`: Create triggers and functions

## API Endpoints

### GET /rooms/availability
Find available rooms for a time period.

Query params:
- `start` (ISO datetime): Start time
- `end` (ISO datetime): End time  
- `capacity` (optional): Minimum capacity
- `location` (optional): Room location filter

### GET /rooms/:id/slots
Generate available time slots for a room.

Query params:
- `start` (ISO datetime): Window start
- `end` (ISO datetime): Window end
- `stepMinutes`: Slot interval
- `durationMinutes`: Meeting duration
- `bufferMinutes` (optional): Buffer time

### POST /holds
Create a temporary hold on a time slot.

Body:
```json
{
  "roomId": 1,
  "start": "2024-01-01T10:00:00Z",
  "end": "2024-01-01T11:00:00Z",
  "phone": "1234567890"
}
```

Returns:
```json
{
  "holdToken": "abc123...",
  "expiresAt": "2024-01-01T10:05:00Z"
}
```

### POST /reservations/confirm
Confirm a reservation using a hold token.

Body:
```json
{
  "holdToken": "abc123...",
  "reserverName": "John Doe",
  "phone": "1234567890",
  "password": "securepass"
}
```

### GET /reservations
List user's reservations (requires Basic Auth).

Headers:
```
Authorization: Basic base64(phone:password)
```

### POST /reservations/:id/cancel
Cancel a reservation before it starts.

Body:
```json
{
  "phone": "1234567890",
  "password": "securepass"
}
```

## Development

### Run development server:
```bash
npm run dev
```

### Run tests:
```bash
npm test
```

### Type checking:
```bash
npm run typecheck
```

### Build for production:
```bash
npm run build
npm start
```

## Business Rules

1. **Holds**: Temporary reservation slots that expire after TTL (default 5 minutes)
2. **Overlaps**: PostgreSQL triggers prevent double-booking via TSRANGE overlap checks
3. **Authentication**: Phone + password hash for reservation management
4. **Cancellation**: Only allowed before reservation start time
5. **Operating Hours**: Rooms have configurable open/close times
6. **Blackouts**: Temporary room unavailability periods

## Error Codes

- `400 invalid_input`: Validation failed
- `401 auth_failed`: Authentication required or failed
- `409 conflict`: Resource conflict (overlap, already cancelled, etc.)
- `410 hold_expired`: Hold token expired
- `500 system_error`: Internal server error

## Testing

Unit tests cover:
- Available room filtering
- Slot generation with conflicts
- Hold creation and expiry
- Reservation confirmation
- Authentication and cancellation

Run with coverage:
```bash
npm run test:coverage
```