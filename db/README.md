# Database Setup Guide

## Supabase 설정 방법

### 1. 데이터베이스 스키마 설치

1. Supabase Dashboard에 로그인
2. SQL Editor 메뉴로 이동
3. `complete_schema.sql` 파일의 내용을 복사
4. SQL Editor에 붙여넣기
5. "Run" 버튼 클릭

### 2. 환경 변수 설정

Supabase Dashboard > Settings > API에서:
- `SUPABASE_URL`: Project URL 복사
- `SUPABASE_SERVICE_KEY`: service_role key 복사 (secret)

### 3. 마이그레이션 파일 설명

- **complete_schema.sql**: 전체 스키마를 한 번에 설치 (권장)
- **0001_init.sql**: 테이블과 인덱스 생성
- **0002_triggers.sql**: 트리거와 함수 생성

### 4. 주요 변경사항

#### GIST 인덱스 수정
- `btree_gist` 확장 필요
- GIST 인덱스에서 `period`를 먼저, `room_id`를 나중에 지정
- 이는 PostgreSQL의 GIST 인덱스 제약사항 때문

#### 샘플 데이터
- 6개의 테스트 회의실 자동 생성
- 다양한 운영 시간과 수용 인원 설정

### 5. 문제 해결

#### ERROR: data type bigint has no default operator class
**해결**: `CREATE EXTENSION IF NOT EXISTS btree_gist;` 실행

#### ERROR: relation "rooms" does not exist
**해결**: `complete_schema.sql`을 처음부터 순서대로 실행

#### 권한 오류
**해결**: 마지막 GRANT 문들이 실행되었는지 확인

### 6. 테스트 쿼리

설치 확인:
```sql
-- 테이블 확인
SELECT * FROM rooms;

-- 예약 가능 시간 확인
SELECT * FROM rooms 
WHERE is_active = true 
AND capacity >= 4;

-- TSRANGE 테스트
SELECT tsrange('2024-01-01 10:00'::timestamp, '2024-01-01 11:00'::timestamp, '[)');
```