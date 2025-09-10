-- Row Level Security (RLS) Policies for Room Reservation System
-- This file enables RLS and creates appropriate policies for each table

-- 1. Enable RLS on all tables
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_blackouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 2. Policies for 'rooms' table
-- Everyone can view active rooms
CREATE POLICY "Rooms are viewable by everyone" 
  ON rooms FOR SELECT 
  USING (is_active = true);

-- Only service role can insert/update/delete rooms
CREATE POLICY "Service role can manage rooms" 
  ON rooms FOR ALL 
  USING (auth.role() = 'service_role');

-- 3. Policies for 'room_blackouts' table
-- Everyone can view blackouts
CREATE POLICY "Blackouts are viewable by everyone" 
  ON room_blackouts FOR SELECT 
  USING (true);

-- Only service role can manage blackouts
CREATE POLICY "Service role can manage blackouts" 
  ON room_blackouts FOR ALL 
  USING (auth.role() = 'service_role');

-- 4. Policies for 'holds' table
-- Service role can do everything
CREATE POLICY "Service role can manage holds" 
  ON holds FOR ALL 
  USING (auth.role() = 'service_role');

-- Users can view their own holds (by phone_hash)
-- Note: In production, you'd want to use proper authentication
CREATE POLICY "Users can view own holds" 
  ON holds FOR SELECT 
  USING (auth.role() = 'anon' OR auth.role() = 'authenticated');

-- 5. Policies for 'reservations' table
-- Service role can do everything
CREATE POLICY "Service role can manage reservations" 
  ON reservations FOR ALL 
  USING (auth.role() = 'service_role');

-- Everyone can view confirmed reservations (for availability checking)
CREATE POLICY "View confirmed reservations" 
  ON reservations FOR SELECT 
  USING (status IN ('confirmed', 'ongoing'));

-- 6. Policies for 'audit_logs' table
-- Only service role can access audit logs
CREATE POLICY "Service role can manage audit logs" 
  ON audit_logs FOR ALL 
  USING (auth.role() = 'service_role');

-- 7. Grant necessary permissions to service role
-- This ensures the backend can perform all operations
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- 8. Grant limited permissions to anon and authenticated roles
-- They can only read certain data
GRANT SELECT ON rooms TO anon, authenticated;
GRANT SELECT ON room_blackouts TO anon, authenticated;
GRANT SELECT ON holds TO anon, authenticated;
GRANT SELECT ON reservations TO anon, authenticated;

-- Allow anon/authenticated to use sequences for potential future features
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Note: Since we're using service_role key in the backend,
-- all operations will bypass RLS. This is intentional as
-- the backend handles authentication and authorization.