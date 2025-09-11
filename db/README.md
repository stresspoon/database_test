# Database Setup (Supabase / PostgreSQL)

## Environment
- SUPABASE_URL
- SUPABASE_ANON_KEY
- TZ=Asia/Seoul

## Apply schema
- Open Supabase SQL editor and paste the SQL from `docs/database.md` (types, tables, indexes, triggers)
- Run in the recommended order (types → tables → indexes → triggers)

## Seed (optional)
```sql
INSERT INTO rooms (name, location, capacity, open_time, close_time) VALUES
('Alpha', 'Seoul HQ', 6, '09:00', '18:00'),
('Beta', 'Seoul HQ', 10, '09:00', '18:00');

INSERT INTO room_blackouts (room_id, period, reason)
SELECT id, tsrange((now() + interval '2 day')::timestamptz, (now() + interval '2 day' + interval '2 hour')::timestamptz, '[)'), 'maintenance'
FROM rooms
WHERE name = 'Alpha';
```

## Notes
- `TSRANGE` uses `[start, end)` semantics.
- Holds TTL cleanup can be lazy during slot calculation or done via external scheduler.

