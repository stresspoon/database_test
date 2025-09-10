-- Complete schema for Room Reservation System
-- Run this in Supabase SQL Editor

-- 1. Enable required extensions
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- 2. Drop existing objects if they exist (for clean installation)
DROP TRIGGER IF EXISTS trg_reservations_no_overlap ON reservations;
DROP TRIGGER IF EXISTS set_reservations_updated_at ON reservations;
DROP TRIGGER IF EXISTS set_rooms_updated_at ON rooms;
DROP FUNCTION IF EXISTS reservations_no_overlap();
DROP FUNCTION IF EXISTS set_updated_at();
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS holds CASCADE;
DROP TABLE IF EXISTS room_blackouts CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TYPE IF EXISTS audit_code CASCADE;
DROP TYPE IF EXISTS audit_event CASCADE;
DROP TYPE IF EXISTS reservation_status CASCADE;

-- 3. Create Types
CREATE TYPE reservation_status AS ENUM ('confirmed', 'ongoing', 'cancelled');
CREATE TYPE audit_event AS ENUM ('search', 'hold_create', 'reserve_confirm', 'reserve_cancel', 'auth');
CREATE TYPE audit_code AS ENUM ('ok', 'invalid_input', 'conflict', 'hold_expired', 'auth_failed', 'policy_violation', 'system_error');

-- 4. Create Tables
CREATE TABLE rooms (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT        NOT NULL,
  location   TEXT        NOT NULL,
  capacity   INTEGER     NOT NULL CHECK (capacity > 0),
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  open_time  TIME        NOT NULL DEFAULT TIME '09:00',
  close_time TIME        NOT NULL DEFAULT TIME '18:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE room_blackouts (
  id         BIGSERIAL PRIMARY KEY,
  room_id    BIGINT     NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  period     TSRANGE    NOT NULL,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE holds (
  id          BIGSERIAL PRIMARY KEY,
  room_id     BIGINT      NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  period      TSRANGE     NOT NULL,
  phone_hash  TEXT,
  hold_token  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reservations (
  id             BIGSERIAL PRIMARY KEY,
  room_id        BIGINT              NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  period         TSRANGE             NOT NULL,
  status         reservation_status  NOT NULL DEFAULT 'confirmed',
  reserver_name  TEXT                NOT NULL,
  phone_hash     TEXT                NOT NULL,
  password_hash  TEXT                NOT NULL,
  created_at     TIMESTAMPTZ         NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ         NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id              BIGSERIAL PRIMARY KEY,
  event           audit_event NOT NULL,
  code            audit_code  NOT NULL,
  reservation_id  BIGINT REFERENCES reservations(id),
  room_id         BIGINT REFERENCES rooms(id),
  message         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Create Indexes
CREATE INDEX idx_rooms_active ON rooms (is_active);
CREATE INDEX idx_blackouts_room_period ON room_blackouts USING GIST (period, room_id);
CREATE INDEX idx_holds_room_period ON holds USING GIST (period, room_id);
CREATE INDEX idx_holds_expiry ON holds (expires_at);
CREATE INDEX idx_reservations_room_period ON reservations USING GIST (period, room_id);
CREATE INDEX idx_reservations_phone ON reservations (phone_hash);
CREATE INDEX idx_reservations_status ON reservations (status);

-- 6. Create Functions and Triggers

-- Function for auto-updating updated_at timestamp
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function for checking reservation overlaps
CREATE OR REPLACE FUNCTION reservations_no_overlap() RETURNS trigger AS $$
DECLARE
  conflicting_id BIGINT;
BEGIN
  IF NEW.status IN ('confirmed','ongoing') THEN
    SELECT r.id INTO conflicting_id
    FROM reservations r
    WHERE r.room_id = NEW.room_id
      AND r.id <> COALESCE(NEW.id, -1)
      AND r.status IN ('confirmed','ongoing')
      AND r.period && NEW.period
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'overlap_conflict with reservation id %', conflicting_id
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER set_rooms_updated_at
BEFORE UPDATE ON rooms
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_reservations_updated_at
BEFORE UPDATE ON reservations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_reservations_no_overlap
BEFORE INSERT OR UPDATE ON reservations
FOR EACH ROW EXECUTE FUNCTION reservations_no_overlap();

-- 7. Insert sample data for testing
INSERT INTO rooms (name, location, capacity, open_time, close_time) VALUES
  ('회의실 A', '3층', 6, '09:00', '18:00'),
  ('회의실 B', '3층', 10, '09:00', '20:00'),
  ('회의실 C', '4층', 4, '08:00', '22:00'),
  ('대회의실', '5층', 20, '09:00', '18:00'),
  ('소회의실 1', '2층', 4, '09:00', '18:00'),
  ('소회의실 2', '2층', 4, '09:00', '18:00');

-- Grant permissions for Supabase
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO postgres, anon, authenticated, service_role;