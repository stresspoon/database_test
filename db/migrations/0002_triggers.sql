-- Triggers and functions per docs/database.md

-- updated_at auto updater
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER set_rooms_updated_at
BEFORE UPDATE ON rooms
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_reservations_updated_at
BEFORE UPDATE ON reservations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- no-overlap trigger for reservations on confirmed/ongoing
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
        USING ERRCODE = 'unique_violation'; -- 23505
    END IF;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reservations_no_overlap
BEFORE INSERT OR UPDATE ON reservations
FOR EACH ROW EXECUTE FUNCTION reservations_no_overlap();

