# /docs/database.md

## 회의실 예약 서비스 — 데이터베이스 관점 최종 문서 (PostgreSQL)

---

### 1) 데이터 플로우(간략)

**유저플로우 1 — 회의실 목록 조회**  
입력: 날짜, 시작·종료 시간(또는 시간 블록), 인원, 위치, 정렬/필터.  
처리: `rooms`에서 활성 방을 선택 → 요청 구간과 `reservations`의 확정/진행 건과의 겹침을 배제 → 인원·위치 필터 및 정렬/페이지네이션.  
출력: 가용 회의실 목록, 쿼리 기준 시각 토큰.

**유저플로우 2 — 세부 시간대 선택**  
입력: 선택한 방, 회의 길이, 시작 가능 범위, 시간 단위, 완충시간.  
처리: 영업시간 및 `room_blackouts` 반영 → 후보 슬롯 생성 → `reservations`의 확정/진행/만료되지 않은 홀드와 겹침 제거 → 슬롯 클릭 시 `holds`에 TTL 홀드 생성.  
출력: 선택 가능한 슬롯 목록, 홀드 성공/만료 시각.

**유저플로우 3 — 예약 확정**  
입력: 홀드 토큰, 예약자 이름, 휴대폰 번호, 비밀번호(확인 포함).  
처리: 입력 유효성·보안 처리(해시) → 홀드 유효성 확인 → 트랜잭션으로 `reservations` insert 및 겹침 재검사 → 로그 기록.  
출력: 예약 ID/메타, 실패 시 원인 코드.

**유저플로우 4 — 조회/취소**  
입력: 휴대폰 번호, 비밀번호(필수), 예약 ID·취소 사유(선택).  
처리: 인증(해시 대조) → 본인 예약 조회 → 시작 전 취소 가능 여부 확인 후 `reservations.status`를 `cancelled`로 갱신 → 로그 기록.  
출력: 예약 리스트 또는 취소 완료/실패 코드.

> 범위 한정: 본 문서는 유저플로우에 **명시적으로 등장한 데이터만** 포함한다. 반복 예약, 결제, 알림, 상세 메시지 등은 제외한다.

---

### 2) 데이터베이스 스키마(최소 스펙)

#### 2.1 보조 타입
```sql
-- 예약 상태(명시된 상태만 사용)
CREATE TYPE reservation_status AS ENUM ('confirmed', 'ongoing', 'cancelled');

-- 감사 로그 이벤트/코드(유저플로우의 "로그 기록(성공/실패, 원인)"을 최소 단위로 반영)
CREATE TYPE audit_event AS ENUM ('search', 'hold_create', 'reserve_confirm', 'reserve_cancel', 'auth');
CREATE TYPE audit_code  AS ENUM ('ok', 'invalid_input', 'conflict', 'hold_expired', 'auth_failed', 'policy_violation', 'system_error');
```

#### 2.2 테이블
```sql
-- 회의실 메타
CREATE TABLE rooms (
  id         BIGSERIAL PRIMARY KEY,
  name       TEXT        NOT NULL,
  location   TEXT        NOT NULL,
  capacity   INTEGER     NOT NULL CHECK (capacity > 0),
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  -- 유저플로우 2: 영업시간 언급 → 최소 필드화
  open_time  TIME        NOT NULL DEFAULT TIME '09:00',
  close_time TIME        NOT NULL DEFAULT TIME '18:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_rooms_active ON rooms (is_active);

-- 임시 차단(블랙아웃)
CREATE TABLE room_blackouts (
  id         BIGSERIAL PRIMARY KEY,
  room_id    BIGINT     NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  period     TSRANGE    NOT NULL,  -- [start, end)
  reason     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_blackouts_room_period ON room_blackouts USING GIST (room_id, period);

-- 잠정 홀드(TTL)
CREATE TABLE holds (
  id          BIGSERIAL PRIMARY KEY,
  room_id     BIGINT      NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  period      TSRANGE     NOT NULL,   -- 완충 포함 실제 점유 구간
  phone_hash  TEXT,                   -- 남용 방지·정책 집행용(선택)
  hold_token  TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_holds_room_period ON holds USING GIST (room_id, period);
CREATE INDEX idx_holds_expiry       ON holds (expires_at);

-- 예약 본표
CREATE TABLE reservations (
  id             BIGSERIAL PRIMARY KEY,
  room_id        BIGINT              NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  period         TSRANGE             NOT NULL,  -- [start, end)
  status         reservation_status  NOT NULL DEFAULT 'confirmed',
  reserver_name  TEXT                NOT NULL,
  phone_hash     TEXT                NOT NULL,  -- 인증 키
  password_hash  TEXT                NOT NULL,  -- 인증 키
  created_at     TIMESTAMPTZ         NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ         NOT NULL DEFAULT now()
);
CREATE INDEX idx_reservations_room_period ON reservations USING GIST (room_id, period);
CREATE INDEX idx_reservations_phone       ON reservations (phone_hash);
CREATE INDEX idx_reservations_status      ON reservations (status);

-- 감사 로그(최소)
CREATE TABLE audit_logs (
  id              BIGSERIAL PRIMARY KEY,
  event           audit_event NOT NULL,
  code            audit_code  NOT NULL,
  reservation_id  BIGINT REFERENCES reservations(id),
  room_id         BIGINT REFERENCES rooms(id),
  message         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### 2.3 제약/트리거(최소)
```sql
-- updated_at 자동 갱신
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

-- 조건부 겹침 금지(confirmed/ongoing에만 적용)
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
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reservations_no_overlap
BEFORE INSERT OR UPDATE ON reservations
FOR EACH ROW EXECUTE FUNCTION reservations_no_overlap();
```

#### 2.4 인덱스·성능 메모
- 시간 겹침 검사에 `TSRANGE` + GiST 인덱스를 사용한다.  
- 가용성 계산은 서버 함수(RPC)에서 수행하고, 동일 파라미터에 대해 단기 캐시를 허용한다.  
- `holds.expires_at`에 인덱스를 두고 만료 청소는 애플리케이션/스케줄러에서 처리한다.

#### 2.5 보안·접근(스키마 범위 참조)
- 휴대폰 번호/비밀번호는 해시(비밀번호는 솔트 포함)로만 저장한다.  
- Supabase RLS/정책은 유저플로우 2의 "접근 제어" 언급에 따라 테이블별 최소 노출을 권장하되, 본 문서에는 데이터 구조만 포함한다.

---

### 3) 마이그레이션 순서(권장)
1. 타입 생성 → 2. 테이블 생성 → 3. 인덱스 생성 → 4. 트리거/함수 배포.  
운영 반영 전, 겹침 트리거 동작 및 `TSRANGE` 경계([start, end))를 단위 테스트로 검증한다.

---

### 4) 부록: 스키마 적용 체크리스트
- [ ] 방 메타(이름/위치/정원/활성/영업시간)만 포함되었는지 확인  
- [ ] 예약 본표가 유저 인증 키(휴대폰/비밀번호 해시)만 저장하는지 확인  
- [ ] 홀드가 TTL/토큰/기간만 저장하는지 확인  
- [ ] 로그가 이벤트/코드/참조키만 포함하는지 확인  
- [ ] 명시되지 않은 데이터(이메일/결제/알림 등)가 포함되지 않았는지 확인

