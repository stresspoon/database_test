-- 상태 타입 (이미 존재하면 생성하지 않음)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'reservation_status'
  ) THEN
    CREATE TYPE reservation_status AS ENUM ('confirmed','ongoing','cancelled');
  END IF;
END $$ LANGUAGE plpgsql;

-- rooms
CREATE TABLE IF NOT EXISTS rooms (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  capacity INT NOT NULL CHECK (capacity > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  open_time TIME NOT NULL DEFAULT TIME '09:00',
  close_time TIME NOT NULL DEFAULT TIME '18:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- holds (TTL 홀드)
CREATE TABLE IF NOT EXISTS holds (
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  period TSRANGE NOT NULL,              -- [start,end)
  phone_hash TEXT,
  hold_token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_holds_room_period ON holds USING GIST (room_id, period);
CREATE INDEX IF NOT EXISTS idx_holds_expiry ON holds (expires_at);

-- reservations
CREATE TABLE IF NOT EXISTS reservations (
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  period TSRANGE NOT NULL,
  status reservation_status NOT NULL DEFAULT 'confirmed',
  reserver_name TEXT NOT NULL,
  phone_hash TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reservations_room_period ON reservations USING GIST (room_id, period);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations (status);

-- 시드(예시)
INSERT INTO rooms (name, location, capacity, open_time, close_time)
VALUES ('Alpha','Seoul HQ',6,'09:00','18:00'),
       ('Beta','Seoul HQ',10,'09:00','18:00')
ON CONFLICT DO NOTHING;


