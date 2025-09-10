-- Types, tables, indexes per docs/database.md

-- 2.1 Types
CREATE TYPE reservation_status AS ENUM ('confirmed', 'ongoing', 'cancelled');
CREATE TYPE audit_event AS ENUM ('search', 'hold_create', 'reserve_confirm', 'reserve_cancel', 'auth');
CREATE TYPE audit_code  AS ENUM ('ok', 'invalid_input', 'conflict', 'hold_expired', 'auth_failed', 'policy_violation', 'system_error');

-- 2.2 Tables
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
CREATE INDEX idx_rooms_active ON rooms (is_active);

CREATE TABLE room_blackouts (
  id         BIGSERIAL PRIMARY KEY,
  room_id    BIGINT     NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  period     TSRANGE    NOT NULL,
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_blackouts_room_period ON room_blackouts USING GIST (room_id, period);

CREATE TABLE holds (
  id          BIGSERIAL PRIMARY KEY,
  room_id     BIGINT      NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  period      TSRANGE     NOT NULL,
  phone_hash  TEXT,
  hold_token  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_holds_room_period ON holds USING GIST (room_id, period);
CREATE INDEX idx_holds_expiry       ON holds (expires_at);

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
CREATE INDEX idx_reservations_room_period ON reservations USING GIST (room_id, period);
CREATE INDEX idx_reservations_phone       ON reservations (phone_hash);
CREATE INDEX idx_reservations_status      ON reservations (status);

CREATE TABLE audit_logs (
  id              BIGSERIAL PRIMARY KEY,
  event           audit_event NOT NULL,
  code            audit_code  NOT NULL,
  reservation_id  BIGINT REFERENCES reservations(id),
  room_id         BIGINT REFERENCES rooms(id),
  message         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

