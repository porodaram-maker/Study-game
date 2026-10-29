# 픽셀공부방 개발 명세서 (Claude Code용)

작성일: 2026-10-29

## 1. 개요와 이 문서 쓰는 법

픽셀공부방은 고등학생이 하루 10분 복습으로 내신과 수능을 대비하고, 공부로 번 별조각으로 고퀄리티 픽셀 아바타와 펫을 꾸미며, 친구와 함께 공부하는 모바일 우선 웹서비스입니다. 아이템, 펫, 시즌 콘텐츠는 에디터와 어드민이 사이트 안의 콘솔에서 코드 수정 없이 추가하고 고칩니다.

**핵심 원칙 (모든 구현에서 지킬 것)**

1. 게임 요소는 학습 원리(인출 연습, 간격 반복, 메타인지)에 묶는다.
2. 보상은 공부 시간이 아니라 실제로 맞히고 기억한 양에 준다.
3. 아이템은 전부 외형만 바꾼다. 능력치, 랜덤 뽑기, 현금 결제는 MVP에 없다.
4. 소셜 기능은 협동과 응원 중심, 자유 채팅 없음.
5. 게임 수치(XP, 별조각, 상한 등)는 코드에 박지 않고 DB 설정값으로 둬서 어드민이 바꾼다.

**Claude Code에서 쓰는 법**

1. 이 파일을 저장소의 `docs/SPEC.md`에 둔다. 함께 받은 `CLAUDE.md`는 저장소 루트에 둔다.
2. 13장의 단계를 하나씩 지시한다. 예: "SPEC 13장 1단계를 구현해줘. 끝나면 테스트하고 체크리스트를 갱신해."
3. 단계가 끝날 때마다 직접 앱을 열어 확인하고 커밋한다.

## 2. 기술 스택과 폴더 구조

Next.js(App Router) + Supabase 조합으로 인증, DB, 파일 저장, 실시간 기능을 한 곳에서 처리합니다.

| 영역 | 선택 | 메모 |
| --- | --- | --- |
| 프레임워크 | Next.js (App Router), TypeScript strict | 서버 액션과 Route Handler 사용 |
| 스타일 | Tailwind CSS | 모바일 우선, 다크 모드 지원 (15장) |
| DB, 인증, 저장소 | Supabase (Postgres, Auth, Storage) | 모든 테이블 RLS 필수 |
| 실시간 | Supabase Realtime (Presence, Broadcast) | 같이 공부방, 친구 대결 |
| 픽셀 렌더링 | PixiJS 또는 Canvas 2D | 레이어 합성과 스프라이트 애니메이션 |
| UI 모션 | Motion (Framer Motion) | 14.5 |
| AI | Claude API (작은 모델 기본, 채점만 큰 모델) | 서버에서만 호출 |
| 복습 알고리즘 | ts-fsrs | FSRS 구현체 |
| 폼, 검증 | react-hook-form + zod | 서버에서도 zod로 재검증 |
| 테스트 | Vitest, Playwright | 핵심 로직 단위 테스트 필수 |
| 배포 | Vercel + Supabase | 크론은 Supabase pg_cron 또는 Vercel Cron |
| PWA | manifest + service worker | 홈 화면 설치 |

```text
/app
  /(auth)/login, /signup, /onboarding
  /(student)/home, /study, /study/[deckId], /review, /wrong, /room, /shop, /friends, /together, /league, /me
  /(console)/console/...        # 에디터·어드민 콘솔 (9장)
  /api/ai/generate, /api/ai/grade, /api/ai/explain
/components
  /pixel   # AvatarRenderer, PetRenderer, RoomRenderer, EffectPlayer, SpriteSheet
  /study   # QuestionCard, ConfidencePicker, ReviewSession
  /ui      # StickerCard, JellyButton, PetToast, ProgressCapsule (15장)
  /console # ItemForm, SpriteUploader, LivePreview, AnimationPlayer, DataTable
/lib
  /supabase (client, server, middleware)
  /srs      # fsrs 래퍼, 스케줄 계산
  /game     # xp, level, streak, stars (설정값 주입)
  /ai       # 프롬프트, 응답 검증 스키마
  /auth     # requireRole()
  /anim     # 프레임 시계, 펫 행동 상태 머신, 이벤트 트리거
/supabase
  /migrations   # SQL 마이그레이션 (4장, 14.6)
  /seed.sql
/docs/SPEC.md
```

## 3. 사용자 역할과 권한

역할은 학생, 에디터, 어드민 세 가지이고 `profiles.role`에 저장합니다. 권한은 화면에서 숨기는 것만으로 끝내지 않고 반드시 RLS와 서버 함수에서 다시 확인합니다.

| 기능 | 학생 | 에디터 | 어드민 |
| --- | --- | --- | --- |
| 공부, 복습, 꾸미기, 친구 | O | O | O |
| 콘솔 접속 | X | O | O |
| 아이템·펫·가구 추가, 수정, 게시 | X | O | O |
| 시즌, 상점 배너, 공지 관리 | X | O | O |
| 공유 문제 세트 검수 (신고 처리) | X | O | O |
| 애니메이션 종류·이펙트·이벤트 연결 관리 | X | X | O |
| 아이템 영구 삭제 | X | X | O |
| 게임 설정값 변경 (XP, 별조각 상한 등) | X | X | O |
| 사용자 조회, 소셜 기능 정지, 별조각 조정 | X | X | O |
| 역할 부여 (에디터 지정) | X | X | O |
| 감사 로그 조회 | X | 본인 기록만 | 전체 |

- 최초 어드민은 Supabase SQL로 직접 지정한다: `update profiles set role = 'admin' where id = '<내 uid>';`
- 서버 코드에서는 `requireRole('editor')` 같은 헬퍼로 막고, DB에서는 `is_editor()`, `is_admin()` SQL 함수를 RLS 정책에 쓴다.
- 에디터와 어드민 계정은 2단계 인증(TOTP)을 켜야 콘솔에 들어갈 수 있게 한다.

## 4. 데이터베이스 스키마

테이블은 학습, 게임, 아이템, 소셜, 운영 다섯 묶음입니다. 아래는 첫 마이그레이션의 기준이고, Claude Code는 여기에 인덱스, RLS 정책, `updated_at` 트리거를 붙여 완성합니다. 아래 SQL은 읽기 쉽게 묶어 쓴 것이라, 실제 마이그레이션에서는 참조되는 테이블(schools, exams, seasons)을 먼저 생성합니다.

```sql
-- 공통
create type user_role as enum ('student','editor','admin');
create type content_status as enum ('draft','published','archived');

-- 사용자
create table schools (id uuid primary key default gen_random_uuid(), name text not null, region text);
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  nickname text not null unique check (char_length(nickname) between 2 and 12),
  grade smallint check (grade between 1 and 3),
  school_id uuid references schools,           -- 선택, 인증 시에만
  role user_role not null default 'student',
  xp int not null default 0,
  stars int not null default 0,
  friend_code char(6) not null unique,
  streak_count int not null default 0,
  streak_last date,
  streak_freezes smallint not null default 0,
  league_opt_out boolean not null default false,
  privacy jsonb not null default '{"level":true,"streak":true,"weekly":true,"status":true,"progress":false}',
  settings jsonb not null default '{"sound":true,"haptics":true,"pet_in_review":true,"theme":"system"}',
  social_banned_until timestamptz,
  created_at timestamptz not null default now()
);

-- 학습
create table exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  name text not null, exam_date date not null, scope jsonb
);
create table decks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles on delete cascade,
  subject text not null, title text not null,
  mode text not null check (mode in ('naesin','suneung')),
  exam_id uuid references exams,
  shared boolean not null default false,
  created_at timestamptz not null default now()
);
create table materials (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references decks on delete cascade,
  storage_path text, extracted_text text, content_hash text,  -- 같은 자료 재사용 판단
  created_at timestamptz not null default now()
);
create table questions (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references decks on delete cascade,
  concept text not null,
  type text not null check (type in ('mcq','blank','ox_reason','essay','explain')),
  prompt text not null,
  options jsonb,              -- mcq: 4개 문자열
  answer jsonb not null,      -- 유형별 정답 구조
  rubric jsonb,               -- 서술형 채점 기준
  explanation text not null,
  difficulty smallint default 2
);
create table card_states (     -- 사용자별 FSRS 상태
  user_id uuid references profiles on delete cascade,
  question_id uuid references questions on delete cascade,
  fsrs jsonb not null,         -- ts-fsrs Card 객체
  due timestamptz not null,
  in_wrong_note boolean not null default false,
  overconfident boolean not null default false,
  primary key (user_id, question_id)
);
create index on card_states (user_id, due);
create table attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles on delete cascade,
  question_id uuid not null references questions on delete cascade,
  correct boolean not null,
  confidence text not null check (confidence in ('sure','maybe','guess')),
  picked jsonb, mistake_type text, duration_ms int,
  created_at timestamptz not null default now()
);

-- 게임
create table star_ledger (     -- 모든 별조각 증감 기록 (잔액은 profiles.stars)
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles on delete cascade,
  delta int not null, reason text not null,  -- review_set, wrong_fixed, purchase, admin_adjust ...
  ref_id text, created_at timestamptz not null default now()
);
create table xp_ledger (like star_ledger including all);
create table leagues (
  id uuid primary key default gen_random_uuid(),
  week_start date not null, tier text not null
);
create table league_members (
  league_id uuid references leagues on delete cascade,
  user_id uuid references profiles on delete cascade,
  weekly_xp int not null default 0, result text,
  primary key (league_id, user_id)
);

-- 아이템 (에디터가 관리)
create table seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null, starts_at timestamptz not null, ends_at timestamptz not null,
  banner_path text, status content_status not null default 'draft'
);
create table item_slots (       -- back, hair_back, body, bottom, shoes, top, face, hair_front, face_acc, hat, hand_item, effect, pet, furniture ...
  key text primary key, label text not null,
  z_index int not null, category text not null   -- avatar | pet | room
);
create table items (
  id uuid primary key default gen_random_uuid(),
  slot_key text not null references item_slots,
  name text not null, description text,
  rarity text not null default 'common',
  price_stars int not null default 0,
  unlock_rule jsonb,            -- 예: {"level":10} 또는 {"streak":30} 또는 {"season":"..."}
  season_id uuid references seasons,
  status content_status not null default 'draft',
  publish_at timestamptz,       -- 예약 게시
  sort_order int not null default 0,
  tags text[] not null default '{}',
  created_by uuid references profiles, updated_by uuid references profiles,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table item_sprites (     -- 한 아이템의 레이어·애니메이션별 스프라이트 시트
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items on delete cascade,
  layer text not null default 'main',   -- main, back, effect 등
  animation text not null,              -- animation_types.key (14.6)
  storage_path text not null,
  frame_w int not null, frame_h int not null, frame_count int not null, fps int not null default 6,
  offset_x int not null default 0, offset_y int not null default 0,
  z_override int
);
create table pet_species (
  item_id uuid primary key references items on delete cascade,
  stages jsonb not null           -- [{"name":"아기","min_xp":0},{"name":"꼬마","min_xp":300},{"name":"어른","min_xp":1200}]
);
create table inventory (
  user_id uuid references profiles on delete cascade,
  item_id uuid references items on delete restrict,
  acquired_at timestamptz not null default now(), source text not null,
  primary key (user_id, item_id)
);
create table equipped (
  user_id uuid references profiles on delete cascade,
  slot_key text references item_slots,
  item_id uuid references items,
  primary key (user_id, slot_key)
);
create table user_pets (
  user_id uuid references profiles on delete cascade,
  item_id uuid references items,
  nickname text, pet_xp int not null default 0, last_cared date, active boolean not null default false,
  primary key (user_id, item_id)
);
create table room_layouts (
  user_id uuid primary key references profiles on delete cascade,
  layout jsonb not null default '[]'  -- [{"item_id":"...","x":3,"y":5,"flip":false}]
);

-- 소셜
create table friendships (
  user_a uuid references profiles on delete cascade,
  user_b uuid references profiles on delete cascade,
  status text not null check (status in ('pending','accepted','blocked')),
  requested_by uuid not null,
  friend_streak int not null default 0,
  primary key (user_a, user_b), check (user_a < user_b)
);
create table cheers (id bigint generated always as identity primary key, from_id uuid, to_id uuid, sticker text, created_at timestamptz default now());
create table study_rooms (id uuid primary key default gen_random_uuid(), host_id uuid not null, invite_code text unique, timer jsonb, created_at timestamptz default now(), closed_at timestamptz);
create table duels (id uuid primary key default gen_random_uuid(), a_id uuid, b_id uuid, question_ids uuid[], scores jsonb, status text, created_at timestamptz default now());
create table study_groups (id uuid primary key default gen_random_uuid(), name text not null, owner_id uuid not null, created_at timestamptz default now());
create table group_members (group_id uuid references study_groups on delete cascade, user_id uuid references profiles on delete cascade, primary key (group_id, user_id));
create table group_goals (id uuid primary key default gen_random_uuid(), group_id uuid references study_groups on delete cascade, week_start date, target int, progress int default 0, reward_item_id uuid references items);

-- 운영
create table game_config (       -- 어드민이 바꾸는 수치 (6.1)
  key text primary key, value jsonb not null, description text,
  updated_by uuid references profiles, updated_at timestamptz not null default now()
);
create table announcements (id uuid primary key default gen_random_uuid(), title text, body text, starts_at timestamptz, ends_at timestamptz, status content_status default 'draft');
create table reports (id uuid primary key default gen_random_uuid(), reporter_id uuid, target_type text, target_id text, reason text, status text default 'open', handled_by uuid, created_at timestamptz default now());
create table ai_usage (id bigint generated always as identity primary key, user_id uuid references profiles on delete set null, kind text, model text, input_tokens int, output_tokens int, created_at timestamptz default now());
create table audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid not null references profiles,
  action text not null,          -- item.create, item.publish, config.update, user.ban, stars.adjust, role.grant ...
  target_type text, target_id text,
  before jsonb, after jsonb, reason text,
  created_at timestamptz not null default now()
);
-- 애니메이션 레지스트리와 이펙트: 14.6
```

- 별조각과 XP 증감은 반드시 원장 테이블에 기록하고, 잔액 변경은 Postgres 함수(`grant_stars`, `spend_stars`) 안에서 한 트랜잭션으로 처리한다. 클라이언트가 `profiles.stars`를 직접 쓰지 못하게 RLS로 막는다.
- 아이템 구매도 `purchase_item(item_id)` 함수 하나로 처리한다: 게시 상태, 해금 조건, 시즌 기간, 잔액을 확인한 뒤 차감과 인벤토리 추가를 함께 한다.
- 학생은 `status = 'published'`이고 시즌 기간 안인 아이템만 읽을 수 있다.

## 5. 학습 시스템

모든 공부는 "자료 올리기 → 문제로 떠올리기(확신도 먼저) → 즉시 피드백 → FSRS로 다음 복습일 계산"을 반복합니다. 복습 자체는 AI를 호출하지 않습니다.

### 5.1 자료 업로드와 문제 생성

1. 입력: 텍스트 붙여넣기, PDF, 사진(최대 10장). PDF는 서버에서 텍스트 추출, 사진은 Claude 비전으로 텍스트화.
2. `content_hash`로 같은 자료가 이미 처리됐는지 확인하고, 있으면 기존 문제를 복사해 AI 비용을 아낀다.
3. 문제 생성 API가 개념 목록과 문제 8~15개를 JSON으로 받는다. zod로 검증하고, 실패하면 1회만 재시도.
4. 생성 직후 학생이 문제를 훑어보고 이상한 문제를 삭제하거나 신고할 수 있다.
5. 무료 사용자는 하루 생성 횟수를 `game_config.ai_daily_generate_limit`(기본 3)로 제한.

### 5.2 문제 유형

| 유형 | 채점 방식 | AI 사용 |
| --- | --- | --- |
| 객관식 (mcq) | 정답 인덱스 비교 | 생성 때만 |
| 빈칸 (blank) | 정규화 후 비교, 허용 답 목록 | 생성 때만 |
| OX + 이유 (ox_reason) | O/X와 이유 선택지 둘 다 맞아야 정답 | 생성 때만 |
| 서술형 (essay) | 루브릭 기반 부분 점수, 빠진 키워드 표시 | 채점마다 |
| 설명하기 (explain) | AI가 빈틈 질문 2~3개, 통과 여부 판정 | 매번 |

### 5.3 확신도와 복습 스케줄

- 문제마다 확신도(확실/애매/모름)를 먼저 고르고 나서야 보기가 활성화된다.
- 결과를 FSRS 등급으로 바꾼다:

| 결과 | FSRS 등급 |
| --- | --- |
| 틀림 (확신도 무관) | Again |
| 맞힘 + 모름 | Hard |
| 맞힘 + 애매 | Good |
| 맞힘 + 확실 | Easy |

- 목표 기억률(desired retention)은 `game_config.srs_retention`(기본 0.9).
- 오늘의 복습 = `due <= now()`인 카드. 한 세트 10문제, 오답노트 카드 먼저, 나머지는 단원을 섞어서(교차 학습).
- 시험 D-7부터는 시험 범위 카드를 기억률 낮은 순으로 하루 한 세트 더 추천한다.
- 단원 진행 바 = 단원 카드들의 현재 기억 확률(retrievability) 평균. 한 번도 안 푼 카드는 0으로 계산.

### 5.4 오답노트

- 틀리면 `in_wrong_note = true`, 확신도가 "확실"이었으면 `overconfident = true`.
- 오답노트 정렬: 확실했는데 틀림 → 최근 틀림 순.
- 다시 맞히면 오답노트에서 빠지고 보상을 준다(6장). 지난 기록은 attempts에 남아 통계로 쓴다.
- 틀린 뒤 학생이 실수 유형(개념 부족, 계산 실수, 문제 잘못 읽음)을 한 번 탭으로 고른다. 선택 사항.

### 5.5 내신 모드와 수능 모드

| 구분 | 내신 | 수능 |
| --- | --- | --- |
| 자료 | 학생이 올린 교과서, 프린트, 필기 | 과목·유형별 개념 (학생 자료 + 직접 만든 문제) |
| 계획 | 시험 날짜와 범위로 하루 분량 자동 배분 | 주간 목표 문제 수 |
| 문제 비중 | 서술형 높음 | 객관식, 유형별 세트 |

기출 원문이나 교과서 문장을 그대로 저장해 다른 사람에게 보여주지 않는다. 공유되는 것은 AI가 새로 만든 문제뿐이다.

## 6. 게임 시스템

모든 수치는 `game_config`의 기본값이고, 어드민이 콘솔에서 바꾸면 코드 배포 없이 바로 적용됩니다. 서버는 설정을 1분 캐시합니다.

### 6.1 기본 설정값 (seed)

| key | 기본값 | 의미 |
| --- | --- | --- |
| xp.correct | 10 | 정답 |
| xp.wrong_fixed | 20 | 오답노트 문제 다시 맞힘 |
| xp.overconfident_fixed | 30 | 확실했는데 틀린 문제 교정 |
| xp.explain_done | 50 | 설명하기 통과 |
| stars.review_set | 5 | 복습 세트(10문제) 완료 |
| stars.wrong_fixed | 3 | 오답 다시 맞힘 |
| stars.overconfident_fixed | 5 | 확실했는데 틀린 문제 교정 |
| stars.explain_done | 15 | 설명하기 통과 |
| stars.streak_7 | 20 | 스트릭 7일마다 |
| stars.room_session | 5 | 같이 공부방 25분 완료 |
| stars.cheer_received | 2 | 응원 받음 (하루 최대 5회분) |
| stars.daily_cap | 60 | 하루 획득 상한 |
| streak.day_reset_hour | 4 | 하루 경계 시각 (KST 새벽 4시) |
| streak.freeze_every | 7 | 보호권 지급 주기(일) |
| streak.freeze_max | 2 | 보호권 최대 보관 |
| level.base / level.step | 100 / 50 | 레벨 n→n+1 필요 XP = base + (n-1)×step |
| league.size / promote / demote | 30 / 7 / 5 | 주간 리그 인원과 승강 |
| notify.quiet_hours | 23~6 | 알림 금지 시간 |
| ai_daily_generate_limit | 3 | 무료 하루 문제 생성 횟수 |
| srs_retention | 0.9 | FSRS 목표 기억률 |
| anim_triggers | 14.1 참조 | 이벤트 → 애니메이션 연결 |

### 6.2 규칙

- **스트릭:** 하루(새벽 4시 기준)에 복습 세트 1개 이상 완료하면 +1. 하루 빠지면 보호권이 있을 때 자동 사용. 7일마다 보호권 1개.
- **레벨업:** 레벨 5, 10, 15…마다 무료 해금 아이템 지급 (`items.unlock_rule`의 level 조건으로 에디터가 지정).
- **리그:** 매주 월요일 0시(KST) 크론이 지난주 결과로 승강을 정하고, 비슷한 XP 수준끼리 30명씩 새로 묶는다. 티어: 브론즈, 실버, 골드, 다이아, 마스터. 참여 끄기 가능.
- **펫 성장:** 주인이 문제를 맞힐 때마다 pet_xp +1. 단계 기준은 `pet_species.stages`. 3일 이상 공부 안 하면 sad 애니메이션, 죽거나 사라지지 않음.
- **보상 지급은 전부 서버 함수에서만.** 클라이언트는 "문제를 풀었다"는 사실만 보내고, 서버가 정답 확인과 보상 계산을 한다.

## 7. 픽셀 아트와 아바타·펫·방 시스템

그림은 코드로 그리지 않고, 픽셀 아티스트가 만든 PNG 스프라이트 시트를 에디터가 콘솔에 올리는 방식입니다. 코드는 정해진 규격대로 레이어를 겹치고 애니메이션만 재생합니다.

### 7.1 아트 규격

| 대상 | 프레임 크기 | 표시 배율 | 애니메이션 |
| --- | --- | --- | --- |
| 아바타 (모든 파츠 공통 캔버스) | 64×64 px | 3~4배 정수 배율 | 14.2 참조 |
| 펫 (단계별) | 48×48 px | 3배 | 14.1 참조 |
| 방 배경 | 320×180 px | 화면 폭에 맞춰 정수 배율 | 창밖 풍경만 선택적으로 4~8프레임 |
| 가구 | 16px 그리드 단위 (예: 32×32, 48×32) | 방과 동일 | 대부분 정지, 조명·화분은 2~4프레임 |
| 이펙트 | 32×32 또는 64×64 | 상황별 | 14.3 참조 |
| UI 아이콘 | 16×16 | 2배 | 정지 |
| 상점 썸네일 | 자동 생성 (idle 첫 프레임 크롭) | - | - |

- **스프라이트 시트 형식:** PNG, 투명 배경, 프레임을 가로로 이어 붙임. 프레임 수 × 프레임 폭 = 이미지 폭.
- **아바타 파츠 규칙:** 모든 아바타 파츠는 같은 64×64 캔버스, 같은 기준점(발끝 중앙 = x32, y60)에 그린다. 그래서 어떤 옷과 모자를 조합해도 위치가 맞는다. 각 애니메이션의 프레임 수와 타이밍도 몸체와 같아야 한다.
- **팔레트:** 전체 공용 팔레트 48색 안에서 그린다(에디터가 콘솔에 팔레트 PNG 등록). 통일감을 위한 권장 사항이고 강제하지 않는다.
- **렌더링:** 정수 배율, `image-rendering: pixelated`, 서브픽셀 위치 금지. 64px 몸체에 2~3px 외곽선, 명암 3단계(기본, 그림자, 하이라이트) 권장.
- **제작 도구:** Aseprite 권장. "Export Sprite Sheet → Horizontal Strip"으로 내보내면 그대로 업로드된다.

### 7.2 레이어 순서 (z_index, 아래에서 위로)

| z | 슬롯 key | 예시 |
| --- | --- | --- |
| 0 | back | 망토, 날개, 가방 |
| 10 | hair_back | 긴 머리 뒷부분 |
| 20 | body | 피부 몸체 (피부색 3종 기본 제공) |
| 30 | bottom | 바지, 치마 |
| 40 | shoes | 신발 |
| 50 | top | 상의, 후드, 교복 |
| 60 | face | 눈, 표정 (blink, happy, sad와 연동) |
| 70 | hair_front | 앞머리 |
| 80 | face_acc | 안경, 마스크 |
| 90 | hat | 모자, 헤드폰, 왕관 |
| 100 | hand_item | 무기·소품 (형광펜 지팡이, 샤프 대검, 단어장 마법서) |
| 110 | effect | 반짝임, 오라 (시즌 한정) |

- 한 아이템이 여러 레이어를 가질 수 있다. 예: 후드티는 top(50)과 back(0, 후드 뒷부분)에 각각 스프라이트를 올린다(`item_sprites.layer`).
- 슬롯 목록과 z_index는 `item_slots` 테이블에 있고 어드민이 슬롯을 추가할 수 있다.
- 착용하지 않은 슬롯은 기본값(맨머리, 기본 티셔츠 등)으로 채운다. 기본 아이템은 `price_stars = 0`, 가입 시 자동 지급.

### 7.3 렌더러 컴포넌트

- `<AvatarRenderer equipped={...} animation="idle" scale={4} />`: 착용 아이템의 스프라이트를 z순으로 겹쳐 그린다. 모든 레이어가 같은 프레임 인덱스를 공유해 동기화된다.
- `<PetRenderer species stage mood />`, `<RoomRenderer layout />`, `<EffectPlayer effect="star_pop" />`도 같은 SpriteSheet 유틸을 쓴다.
- 스프라이트 이미지는 Supabase Storage `sprites` 버킷(공개 읽기)에서 받아 메모리에 캐시한다.
- 친구 목록처럼 아바타가 많이 나오는 곳은 첫 프레임만 그린 정지 이미지를 쓴다. 성능 때문.
- `prefers-reduced-motion`이면 애니메이션을 끄고 첫 프레임만 표시.

### 7.4 방 꾸미기

- 방은 320×180 배경 위에 16px 그리드. 가구는 바닥 영역과 벽 영역 중 정해진 곳에만 놓인다(`items.tags`에 floor/wall).
- 드래그로 배치, 탭으로 좌우 반전, 길게 눌러 회수. 결과는 `room_layouts.layout`에 저장.
- 아바타와 펫은 방 안에서 14장의 행동 규칙대로 움직이고, 공부 타이머 중에는 study 애니메이션(책상에 앉기)을 재생한다.

## 8. 친구와 같이 하는 기능

친구는 서로 수락해야 맺어지고, 모든 소통은 정해진 스티커와 문구로만 합니다. 실시간 기능은 Supabase Realtime으로 만듭니다.

### 8.1 친구

- **추가:** 6자리 친구 코드 입력, QR 스캔, 초대 링크(`/invite/[code]`, 가입 후 자동 요청). 닉네임 검색은 없음.
- **요청 상태:** pending → accepted, 또는 blocked. 차단하면 서로 프로필과 방 방문이 안 보인다.
- **프로필 공개 범위:** `profiles.privacy`의 항목별 on/off. 아바타와 닉네임은 항상 공개.
- **응원:** 친구에게 하루 1회 스티커. 받는 사람 별조각 지급(하루 상한 있음), 받는 사람의 펫이 cheer 애니메이션.
- **콕 찌르기:** 오늘 복습 안 한 친구에게 알림, 같은 친구에게 하루 1회. 조용한 시간에는 아침으로 미룬다.
- **친구 스트릭:** 두 사람 모두 그날 세트를 끝내면 +1. 매일 새벽 4시 크론이 계산.
- **방 놀러가기:** 친구 방을 읽기 전용으로 보고(내 아바타가 wave), 펫에게 간식(하루 1회, 펫 xp +5, eat 애니메이션).
- **제한:** 친구 최대 100명, `social_banned_until`이 지나지 않은 사용자는 소셜 기능 전부 막힘.

### 8.2 같이 공부방

- 친구 최대 6명. 방장이 만들고 초대 코드나 친구 목록으로 초대.
- 타이머 상태(집중/휴식, 남은 시간, 회차)는 `study_rooms.timer`에 저장하고 Realtime Broadcast로 동기화. 시간 계산은 서버 시각 기준 `started_at`에서 계산해 기기마다 어긋나지 않게 한다.
- 각자 상태(공부 중 과목, 자리 비움)는 Presence로. 앱이 백그라운드로 가면 `visibilitychange`로 자리 비움 표시.
- 화면: 공용 공부방 배경에 참가자 아바타가 책상에 앉아 study 애니메이션, 휴식 시간에는 펫들이 sleep. 휴식 시간에만 이모지 반응.
- 25분 집중을 끝까지 채운 참가자에게 별조각 지급(서버가 Presence 기록으로 확인).

### 8.3 친구 대결

1. 한 명이 친구와 단원을 골라 대결 신청.
2. 서버가 두 사람이 공통으로 가진 단원, 또는 신청자의 공유 세트에서 10문제를 뽑아 `duels.question_ids`에 저장.
3. 동시에 풀기(Realtime으로 상대 진행률 표시) 또는 24시간 안에 각자 풀기.
4. 점수 = 정답 수 + 확신도 정확성 보너스(확실하다고 하고 맞히면 +0.5, 확실하다고 하고 틀리면 −0.5).
5. 결과 화면에서 서로 틀린 문제와 해설을 같이 본다. 보상은 XP만.

### 8.4 스터디 그룹

- 3~10명, 주간 목표(예: 그룹 전체 500문제). 각자 푼 문제가 `group_goals.progress`에 더해진다.
- 개인 순위는 표시하지 않고 기여한 사람에게 응원 마크만.
- 목표 달성 시 그룹 전원에게 한정 배지 아이템(에디터가 지정)과 별조각, confetti 연출.

### 8.5 문제 세트 공유

- 내 단원을 친구나 그룹에 공유 가능(`decks.shared`). 받은 사람은 복사본을 갖는다.
- 공유되는 건 AI가 만든 문제와 해설뿐, 원본 자료는 공유되지 않는다.
- 신고된 세트는 콘솔 검수 큐로 간다(9장).

## 9. 에디터·어드민 콘솔

콘솔은 `/console` 아래 데스크톱 우선 화면이고, 에디터는 콘텐츠를, 어드민은 콘텐츠와 운영 전부를 다룹니다. 콘솔에서 하는 모든 변경은 `audit_logs`에 누가, 언제, 무엇을, 이전 값과 이후 값까지 남깁니다.

### 9.1 콘솔 메뉴

| 메뉴 | 경로 | 에디터 | 어드민 |
| --- | --- | --- | --- |
| 대시보드 | /console | O | O |
| 아이템 (코디·무기·소품) | /console/items | O | O |
| 펫 | /console/pets | O | O |
| 가구·방 배경 | /console/room | O | O |
| 애니메이션·이펙트 | /console/animations | 보기만 | O |
| 슬롯과 레이어 | /console/slots | 보기만 | O |
| 시즌과 상점 배너 | /console/seasons | O | O |
| 공지 | /console/announcements | O | O |
| 신고·공유 세트 검수 | /console/reports | O | O |
| 게임 설정 | /console/config | X | O |
| 사용자 | /console/users | X | O |
| 역할 관리 | /console/roles | X | O |
| 감사 로그 | /console/audit | 본인 | O |

### 9.2 아이템 편집기 (가장 중요한 화면)

왼쪽은 입력 폼, 오른쪽은 실시간 미리보기로 나눕니다.

**입력 필드**

- 기본: 이름, 설명, 슬롯(드롭다운), 희귀도(일반, 레어, 에픽, 한정), 태그.
- 가격과 해금: 별조각 가격, 해금 조건(없음 / 레벨 N 이상 / 스트릭 N일 / 그룹 목표 보상 / 레벨업 보상 전용), 시즌 연결.
- 스프라이트: `animation_types`에서 대상(avatar/pet)의 목록을 읽어 애니메이션별 PNG 업로드 칸을 자동으로 만든다(필수는 별표). 레이어 추가 버튼으로 back, effect 같은 보조 레이어도 올린다. 각 업로드마다 프레임 폭·높이, 프레임 수, fps, x/y 오프셋, z 덮어쓰기.
- 상태: 초안 / 게시 / 보관, 예약 게시 시각. 저장은 언제나 초안으로, 게시 버튼은 따로.

**업로드 자동 검사** (실패하면 저장 불가, 이유 표시)

- PNG인지, 투명 배경인지.
- 이미지 폭이 프레임 폭 × 프레임 수와 정확히 맞는지, 높이가 프레임 높이와 맞는지.
- 아바타 슬롯이면 프레임이 64×64인지, 프레임 수가 몸체 애니메이션과 같은지.
- 파일 2MB 이하. 저장소 경로는 `sprites/{item_id}/{layer}_{animation}_v{n}.png`, 덮어쓸 때는 버전 번호를 올려 캐시 문제를 막는다.

**실시간 미리보기**

- 기본 몸체 위에 이 아이템을 입힌 아바타를 4배로 재생. 애니메이션 탭으로 전환(없는 애니메이션은 대체 규칙으로 재생되고 "idle 대체 중" 표시).
- "다른 아이템과 함께 보기": 인기 아이템 몇 개를 같이 입혀서 레이어 충돌(머리카락이 모자를 뚫는 등)을 확인.
- 배경 밝게/어둡게 토글, 1배·2배·4배 확대, 재생/정지, 프레임 하나씩, 속도 0.5배·1배·2배.
- 상점 카드와 친구 목록에 어떻게 보일지 작은 미리보기.

**게시 규칙**

- 게시 전 체크: 필수 애니메이션 스프라이트 모두 있음, 가격 또는 해금 조건 중 하나 설정, 미리보기 확인 체크박스.
- 게시한 아이템의 가격을 올리는 건 허용하되 경고 표시. 이미 산 학생에게는 영향 없음.
- 누가 하나라도 가진 아이템은 삭제 대신 보관만 가능(상점에서만 사라지고 보유자는 계속 착용). 영구 삭제는 아무도 안 가진 아이템만, 어드민만.
- 여러 개 한 번에: CSV + 이미지 zip 일괄 업로드(이름, 슬롯, 가격, 파일명). 전부 초안으로 들어간다.

### 9.3 펫 편집기

- 아이템 편집기와 같은 구조 + 성장 단계 표: 단계 이름, 필요 pet_xp, 단계별·애니메이션별 스프라이트(14.1 목록).
- 미리보기에서 단계, 기분(기본, sad, sleep), 이벤트(happy, eat, cheer, evolve)를 바꿔 가며 확인. 빈 방에 놓고 걷기 행동까지 시험 재생.

### 9.4 가구·방 배경 편집기

- 그리드 크기(16px 단위 가로×세로), 설치 위치(바닥/벽), 반전 허용 여부.
- 미리보기: 빈 방에 놓아보고 아바타와 크기 비교.

### 9.5 시즌과 상점

- 시즌: 이름, 시작·종료 일시, 배너 이미지, 포함 아이템 선택. 기간이 지나면 해당 아이템은 자동으로 상점에서 빠진다.
- 상점 진열 순서: 드래그로 정렬(`items.sort_order`). "신상", "추천" 배지 토글.
- 예약 게시: 게시 시각을 미리 정해두면 크론이 그 시각에 status를 published로 바꾼다.

### 9.6 게임 설정 (어드민)

- 6.1의 모든 key를 표로 보여주고 값 수정. 숫자 범위 검증(예: 별조각 상한 0~500).
- 변경 시 사유 입력 필수, 감사 로그에 이전·이후 값 기록. "기본값으로 되돌리기" 버튼.

### 9.7 사용자 관리 (어드민)

- 닉네임, 친구 코드, 이메일로 검색. 상세: 레벨, 별조각 잔액과 원장 내역, 보유 아이템, 최근 신고.
- 조치: 닉네임 강제 변경, 소셜 기능 정지(기간 지정), 별조각 지급·회수(사유 필수, 원장에 admin_adjust로 기록), 계정 정지.
- 학습 기록(문제, 업로드 자료)은 어드민도 기본적으로 내용을 볼 수 없고, 신고가 걸린 공유 세트만 열람 가능.

### 9.8 역할 관리 (어드민)

- 사용자에게 에디터 역할 부여·회수. 어드민 부여는 다른 어드민 1명의 승인이 필요(2인 승인).
- 에디터·어드민 목록과 마지막 콘솔 접속 시각.

### 9.9 신고와 검수

- 신고 대상: 닉네임, 공유 문제 세트, 응원 남용. 큐에서 열람 → 조치(숨김, 경고, 정지) 또는 기각.
- 처리 결과는 신고자에게 알림(내용 없이 "처리됨"만).

### 9.10 감사 로그

- 필터: 사람, 작업 종류, 대상, 기간. 이전·이후 값을 JSON diff로 표시.
- 로그는 수정·삭제 불가(RLS로 insert만 허용, update·delete 금지).

## 10. 화면 목록과 라우트

학생 화면은 하단 탭 5개(홈, 공부, 같이, 친구, 내 방)로 묶고, 모든 기능에 탭에서 한 번 더 눌러 닿게 합니다.

| 경로 | 화면 | 핵심 내용 |
| --- | --- | --- |
| /login, /signup | 로그인, 가입 | 이메일 또는 소셜 로그인, 만 14세 이상 확인 |
| /onboarding | 첫 설정 | 닉네임, 학년, 피부색·기본 코디 고르기, 첫 펫 고르기 (펫이 happy로 인사) |
| /home | 홈 | 방 장면(아바타, 펫), 오늘의 복습 버튼, 스트릭 불꽃, 레벨, D-day, 공지 |
| /review | 복습 세트 | 확신도 → 답 → 피드백, 구석의 펫 반응, 세트 결과 화면 |
| /study | 공부 | 단원 목록과 기억 진행 바, 자료 올리기 |
| /study/[deckId] | 단원 상세 | 문제 목록 확인·삭제·신고, 공부하기, 공유 |
| /study/new | 자료 올리기 | 텍스트, PDF, 사진 업로드 → 단계별 생성 진행 표시 |
| /wrong | 오답노트 | 확실했는데 틀림 우선, 실수 유형 필터, 다시 풀기 |
| /exams | 시험 계획 | 시험 등록, 범위 단원 선택, 하루 분량 |
| /together | 같이 | 공부방 만들기·입장, 대결 신청, 그룹 |
| /together/room/[id] | 같이 공부방 | 타이머, 참가자 아바타 |
| /together/duel/[id] | 대결 | 문제 풀이와 결과 |
| /friends | 친구 | 목록, 요청, 코드·QR 추가, 응원, 콕 찌르기 |
| /friends/[id] | 친구 방 | 친구 방 구경, 펫 간식 |
| /league | 리그 | 이번 주 순위, 승강 구간 |
| /room | 내 방 | 방 꾸미기 편집, 착용 변경 |
| /shop | 상점 | 카테고리별 아이템, 시즌 배너, 미리 입어보기 |
| /me | 설정 | 공개 범위, 알림, 효과음·진동, 복습 중 펫 표시, 테마, 리그 참여, 계정 |
| /console/* | 콘솔 | 9장 참조 |

- 상점에서 아이템을 누르면 내 아바타에 입혀본 미리보기(idle과 happy 번갈아 재생)가 먼저 나오고, 구매는 그 다음.
- 모든 학생 화면은 360px 폭에서 깨지지 않아야 하고, 콘솔은 1280px 기준.

## 11. 서버 함수, AI 프롬프트, 비용 관리

점수, 보상, 구매처럼 조작되면 안 되는 일은 전부 서버(Route Handler 또는 Postgres 함수)에서 처리합니다. AI 키는 서버 환경변수에만 둡니다.

### 11.1 주요 서버 함수

| 이름 | 위치 | 하는 일 |
| --- | --- | --- |
| POST /api/ai/generate | Route Handler | 자료 → 문제 생성, 한도 확인, 해시 재사용 |
| POST /api/ai/grade | Route Handler | 서술형 루브릭 채점 |
| POST /api/ai/explain | Route Handler | 설명하기 피드백 |
| submit_answer(question_id, picked, confidence, duration) | 서버 액션 → SQL 함수 | 채점, FSRS 갱신, 오답노트, XP·별조각 지급, 발생 이벤트 목록 반환(애니메이션용) |
| complete_review_set(session_id) | SQL 함수 | 세트 보상, 스트릭 갱신, 레벨업·진화 여부 반환 |
| purchase_item(item_id) | SQL 함수 | 조건 확인, 차감, 인벤토리 추가 |
| equip_item(slot, item_id) | SQL 함수 | 보유 확인 후 착용 |
| send_cheer / poke_friend / feed_pet | SQL 함수 | 하루 횟수 제한 확인 |
| admin_* (config, stars, ban, role) | SQL 함수 (security definer) | 역할 확인 + 감사 로그 기록을 한 트랜잭션으로 |
| cron: daily_rollover (매일 04:00 KST) | pg_cron | 스트릭 끊김·보호권, 친구 스트릭, 펫 기분 |
| cron: weekly_league (월 00:00 KST) | pg_cron | 리그 정산과 재편성 |
| cron: publish_scheduled (5분마다) | pg_cron | 예약 게시 아이템·시즌 반영 |

서버 함수는 보상과 함께 `events` 배열(예: `["review.correct","stars.gained","level.up","pet.evolve"]`)을 돌려주고, 클라이언트는 이 목록과 `anim_triggers`로 어떤 애니메이션을 재생할지 정한다.

### 11.2 문제 생성 프롬프트 (기준안)

```text
너는 한국 고등학생용 학습 문제를 만드는 출제 위원이다. 아래 자료만 근거로 문제를 만든다.
과목: {subject} / 단원: {title} / 모드: {naesin|suneung}
규칙:
- 문제 8~15개. 유형 비율: 객관식 60%, 빈칸 20%, OX+이유 10%, 서술형 10% (수능 모드는 서술형 제외)
- 객관식 오답 보기는 학생이 실제로 헷갈릴 개념으로 만든다.
- 자료에 없는 내용은 출제하지 않는다. 자료 문장을 그대로 베끼지 말고 새로 쓴다.
- 해설은 1~2문장: 왜 정답인지 + 흔한 착각.
- concept는 핵심 개념 이름(10자 이내). 정답 위치는 고르게 섞는다.
JSON만 출력: {"concepts":[...],"questions":[{"type":"mcq","concept":"","prompt":"","options":["","","",""],"answer":0,"explanation":"","rubric":null}]}
자료:
"""{text}"""
```

- 서술형 채점과 설명하기 프롬프트도 같은 형식(역할, 규칙, JSON 출력)으로 `lib/ai/prompts.ts`에 둔다.
- 과제 대필 방지: 설명하기·서술형 프롬프트에는 "학생 답을 대신 써주지 말고 빠진 부분을 질문으로 짚어라"를 넣는다.

### 11.3 비용 관리

- 문제 생성은 작은 모델(Haiku급), 서술형 채점만 상위 모델. 모델 이름은 환경변수로.
- 같은 자료 해시 재사용, 즉시 필요 없는 생성은 Batch API로.
- 사용자별·일별 AI 호출 수와 토큰 수를 `ai_usage`에 기록하고 콘솔 대시보드에 표시.
- 입력 자료는 최대 1.5만 토큰으로 자르고, 넘으면 단원을 나눠 올리라고 안내.

## 12. 보안, 개인정보, 미성년자 안전

사용자가 고등학생이라 기본값을 가장 보수적으로 둡니다. 아래 법적 항목은 출시 전 전문가 검토가 필요합니다.

**보안**

- 모든 테이블 RLS 켜기. 학생은 자기 행만 읽고 쓰기, 친구 관련 읽기는 accepted 관계 + privacy 설정을 통과할 때만.
- 잔액, XP, 역할, 아이템 상태는 클라이언트가 직접 못 바꾼다. 변경은 security definer 함수로만.
- 콘솔 라우트는 미들웨어에서 역할 확인 + 서버 함수에서 다시 확인(이중 확인). 에디터·어드민 2단계 인증 필수.
- 업로드 파일은 MIME과 확장자 둘 다 검사, 이미지 재인코딩(sharp)으로 악성 데이터 제거.
- AI 엔드포인트는 사용자별 속도 제한(분당 3회 등).

**개인정보**

- 수집 최소화: 이메일(로그인용), 닉네임, 학년, 학교(선택). 실명, 전화번호, 생년월일 원문은 받지 않음(만 14세 이상 여부만 확인).
- 학생이 올린 자료와 문제는 본인만 열람. 어드민도 신고된 공유 세트만 볼 수 있다.
- 계정 삭제 시 학습 자료와 기록 삭제, 원장·감사 로그는 익명 처리 후 보관.
- 학습 데이터를 광고나 외부 업체에 제공하지 않는다.

**미성년자 안전**

- 만 14세 미만 가입 차단(법정대리인 동의 절차는 출시 후 검토).
- 자유 채팅 없음, 낯선 사람 검색 없음, 친구는 코드·QR·링크로만.
- 닉네임 금칙어 필터와 신고 버튼.
- 23시~6시 알림 금지, 스트릭 마감 새벽 4시.
- 나중에 유료 결제를 붙일 때: 랜덤 뽑기 금지, 부모 동의와 월 결제 한도, 유료 아이템과 별조각 아이템 구분.

## 13. 개발 단계와 Claude Code 작업 순서

단계마다 Claude Code에 "SPEC 13장 N단계 구현해줘"라고 지시하고, 완료 기준을 직접 확인한 뒤 다음으로 넘어갑니다. 콘솔(5단계)을 픽셀 렌더러 바로 뒤에 두는 이유는, 아이템을 코드가 아니라 콘솔로 넣는 흐름을 처음부터 쓰기 위해서입니다.

### 0단계 (선택): 디자인 시안

- [ ] 15장 기준으로 홈, 복습, 상점, 콘솔 아이템 편집기 4개 화면을 `/design` 폴더에 정적 HTML 시안으로 만들기
- 완료 기준: 시안을 보고 색과 모양을 확정

### 1단계: 프로젝트 뼈대와 인증

- [x] Next.js + TypeScript + Tailwind(15.5 토큰) + Supabase 클라이언트 설정, `.env.example`
- [x] 4장과 14.6 스키마를 참조 순서에 맞게 마이그레이션으로 작성
- [x] RLS 정책, `is_editor()` `is_admin()` 함수, `requireRole()` 헬퍼
- [x] 가입, 로그인, 온보딩(닉네임, 학년), 친구 코드 자동 생성
- 완료 기준: 가입 → 온보딩 → 빈 홈 화면 진입, 다른 사용자 데이터 조회가 RLS로 막히는 테스트 통과

### 2단계: 학습 핵심

- [ ] 자료 올리기(텍스트 우선), /api/ai/generate, zod 검증, 하루 한도
- [ ] 복습 세션 UI (확신도 → 답 → 피드백), submit_answer, ts-fsrs 연동
- [ ] 오답노트, 단원 진행 바
- 완료 기준: 자료 붙여넣기 → 문제 생성 → 10문제 풀기 → 다음 날 복습 목록에 나타남(시계 조작 테스트)

### 3단계: 게임 시스템

- [ ] game_config 테이블과 seed, 설정 캐시
- [ ] XP·별조각 원장과 지급 함수, 일일 상한, 레벨 계산, events 반환
- [ ] 스트릭과 보호권, daily_rollover 크론, 시험 D-day
- 완료 기준: 설정값을 DB에서 바꾸면 보상이 바로 바뀜, 상한 초과 지급 안 됨 테스트

### 4단계: 픽셀 렌더러와 애니메이션 엔진

- [ ] SpriteSheet 유틸, 공유 프레임 시계, AvatarRenderer(레이어 합성), PetRenderer, RoomRenderer, EffectPlayer
- [ ] animation_types 레지스트리와 seed(14.1, 14.2 표), 대체 규칙
- [ ] item_slots seed (7.2 표), 임시 테스트 스프라이트로 동작 확인
- 완료 기준: 서로 다른 시트 4장을 겹쳐도 프레임이 어긋나지 않음, 없는 애니메이션은 idle로 대체됨, 정수 배율로 선명

### 5단계: 에디터·어드민 콘솔 (콘텐츠)

- [ ] /console 레이아웃, 역할 가드, 2단계 인증
- [ ] 아이템 편집기: 폼, 애니메이션별 업로드 칸 자동 생성, 자동 검사, 미리보기 플레이어, 초안·게시·보관
- [ ] 펫 편집기(성장 단계, 애니메이션), 가구 편집기, 애니메이션·이펙트 메뉴, 시즌, 상점 정렬, 예약 게시
- [ ] 감사 로그 기록과 조회
- 완료 기준: 에디터 계정으로 새 모자를 올리고 게시하면 학생 상점에 바로 보이고, 감사 로그에 남음. 학생 계정은 /console 접근 불가

### 6단계: 상점, 꾸미기, 방, 펫 행동

- [ ] 상점(미리 입어보기, purchase_item), 착용, 기본 아이템 자동 지급
- [ ] 펫 키우기(pet_xp, 단계, 기분), 펫 행동 상태 머신(14.1), anim_triggers 연결
- [ ] 방 꾸미기(그리드 배치, 저장), 특별 연출(진화, 레벨업, 스트릭)
- 완료 기준: 별조각으로 사서 입고 홈 장면에 반영, 정답 시 펫 happy, 진화 연출 재생. 잔액 조작 시도(클라이언트 직접 update) 실패

### 7단계: 친구

- [ ] 친구 코드·QR·초대 링크, 요청·수락·차단, 공개 범위
- [ ] 응원, 콕 찌르기, 친구 스트릭, 친구 방 방문, 펫 간식
- 완료 기준: 두 계정으로 친구 맺기 → 응원 → 별조각 지급과 펫 cheer, 차단 후 서로 안 보임

### 8단계: 같이 하기

- [ ] 같이 공부방(Realtime 타이머, Presence)
- [ ] 친구 대결, 스터디 그룹 목표, 문제 세트 공유
- 완료 기준: 브라우저 3개로 공부방 동시 접속 시 타이머 오차 1초 이내

### 9단계: 운영 도구와 리그

- [ ] 어드민 게임 설정 화면, 사용자 관리, 역할 관리(2인 승인), 신고 큐
- [ ] 주간 리그 크론과 리그 화면, AI 사용량 대시보드
- 완료 기준: 어드민이 별조각 상한을 바꾸면 사유와 함께 로그에 남고 즉시 적용

### 10단계: 마무리와 출시 준비

- [ ] UI 모션 전체 점검(14.5), 효과음·진동 설정, reduced motion 대응
- [ ] PWA, 알림(조용한 시간 포함), 다크 모드, 접근성 점검
- [ ] Playwright로 핵심 흐름 E2E 테스트(가입 → 복습 → 구매 → 친구)
- [ ] 개인정보처리방침, 이용약관, 만 14세 확인 문구
- 완료 기준: 360px 폰에서 전체 흐름이 막힘 없이 동작

**아트 준비는 개발과 동시에:** 1단계를 시작할 때 픽셀 아티스트에게 7.1 규격과 14장의 애니메이션 목록을 전달하고, 기본 몸체 3종(idle, study, blink), 기본 옷 세트, 첫 펫 3종(idle, walk, happy, eat, sleep), 방 배경 1개, 공용 이펙트, UI 아이콘 세트를 먼저 주문하면 5단계 콘솔 완성 시점에 바로 올릴 수 있습니다.

## 14. 애니메이션 설계

애니메이션은 세 종류입니다. 픽셀 스프라이트 애니메이션(아바타, 펫, 이펙트)은 아티스트가 그린 시트를 재생하고, UI 모션(버튼, 보상, 화면 전환)은 코드로 만듭니다. 새 애니메이션 종류는 콘솔에서 추가할 수 있게 레지스트리로 관리합니다.

### 14.1 펫 애니메이션

| key | 프레임 / fps | 반복 | 언제 나오나 |
| --- | --- | --- | --- |
| idle | 4 / 6 | 반복 | 기본 상태, 숨 쉬듯 위아래로 1px |
| blink | 2 / 8 | 1회 | idle 중 3~6초마다 무작위 |
| walk | 6 / 8 | 반복 | 방 안을 돌아다닐 때 (방향에 따라 좌우 반전) |
| happy | 6 / 10 | 1회 | 주인이 정답을 맞힘, 탭해서 쓰다듬기 |
| encourage | 4 / 8 | 1회 | 주인이 틀림 ("괜찮아" 몸짓) |
| eat | 6 / 8 | 1회 | 간식 받음 (주인 또는 친구) |
| cheer | 6 / 10 | 2회 | 복습 세트 완료, 응원 받음 |
| sleep | 4 / 3 | 반복 | 23시~6시, 같이 공부방 휴식 시간 |
| sad | 4 / 4 | 반복 | 3일 이상 공부 안 함 |
| evolve | 8 / 10 | 1회 | 진화 연출 (14.4 참조) |

**펫 행동 규칙 (우선순위 높은 순)**

1. evolve → eat → happy, cheer, encourage (이벤트로 한 번 재생 후 원래 상태로 복귀)
2. sad (기분 상태) → sleep (시간대)
3. 그 외에는 idle과 walk를 섞는다: 4~8초마다 바닥 영역 안 무작위 지점으로 걸어가고 도착하면 idle.

- 복습 화면 오른쪽 아래에 펫이 작게(2배) 따라다니며 정답·오답에 반응한다. 집중을 방해하지 않게 끌 수 있다.
- 이벤트와 애니메이션 연결은 `game_config.anim_triggers`에 둔다. 예: `{"review.correct":"happy","review.wrong":"encourage","set.complete":"cheer","cheer.received":"cheer","pet.fed":"eat"}`. 어드민이 콘솔에서 바꿀 수 있다.

### 14.2 아바타 애니메이션

| key | 프레임 / fps | 필수 여부 | 언제 나오나 |
| --- | --- | --- | --- |
| idle | 4 / 6 | 모든 파츠 필수 | 기본 |
| blink | 2 / 8 | face 슬롯만 | idle 중 무작위 |
| study | 4 / 6 | 모든 파츠 필수 | 공부 타이머, 같이 공부방 |
| walk | 6 / 8 | 선택 | 방 이동, 공부방 입장 |
| happy | 6 / 10 | 선택 | 정답 연속 5개, 구매 직후 |
| sad | 4 / 4 | 선택 | 세트 정답률 50% 미만 |
| wave | 6 / 8 | 선택 | 친구 방 방문, 친구 수락 |
| celebrate | 8 / 10 | 선택 | 레벨업, 리그 승급 |

- **대체 규칙:** 어떤 아이템에 그 애니메이션 시트가 없으면 idle 시트의 같은 프레임 번호(프레임 수로 나눈 나머지)를 쓴다. 그래서 선택 애니메이션이 없는 옷도 깨지지 않는다.
- 모든 레이어는 하나의 프레임 시계를 공유한다. 몸체의 프레임 인덱스를 기준으로 다른 레이어가 따라간다.
- 픽셀 이동(걷기, 점프 높이)은 스프라이트 안에서 그리고, 코드에서는 위치를 정수 픽셀 단위로만 옮긴다.

### 14.3 공용 이펙트 스프라이트

| key | 프레임 | 쓰임 |
| --- | --- | --- |
| star_pop | 6 | 별조각 획득 위치에서 터짐 |
| xp_float | 6 | "+10 XP"가 떠오를 때 반짝임 |
| level_burst | 8 | 레벨업 화면 배경 폭발 |
| flame_s / flame_m / flame_l / flame_blue | 4 (반복) | 스트릭 불꽃: 1~6일 s, 7~29일 m, 30~99일 l, 100일 이상 blue |
| confetti | 10 | 세트 완료, 그룹 목표 달성 |
| heart | 6 | 펫 간식, 응원 받음 |
| zzz | 4 (반복) | 펫 잠잘 때 |
| evolve_glow | 8 | 펫 진화 연출 |
| dust | 4 | 걷기 시작, 착지 |

### 14.4 특별 연출

- **펫 진화 (약 3초):** 화면 어두워짐 → 펫이 흰 실루엣으로 깜빡임(점점 빨라짐, 코드) → evolve_glow → 새 단계 펫이 happy 재생 → "민트 슬라임이 꼬마가 됐어요!" 말풍선. 건너뛰기 버튼 제공.
- **레벨업:** 풀스크린 카드, 아바타 celebrate + level_burst, 새로 해금된 아이템 카드가 뒤집히며 등장.
- **리그 승급:** 티어 배지가 위로 올라가며 confetti.
- **스트릭 갱신:** 상단 불꽃이 한 번 커졌다 줄어들고 숫자가 넘어가는 애니메이션. 단계가 바뀌는 날은 불꽃 스프라이트 교체 연출.

### 14.5 UI 모션 (코드)

| 상황 | 동작 | 시간 |
| --- | --- | --- |
| 버튼 누름 | 아래로 3px 눌리고 그림자 줄어듦, 손 떼면 살짝 튕김 | 80ms / 180ms |
| 정답 | 보기 카드가 1.04배로 튕기고 초록 채움이 왼쪽에서 번짐 | 300ms |
| 오답 | 보기 카드 좌우 흔들기 6px 3회 | 300ms |
| 별조각 획득 | star_pop 후 별 아이콘이 곡선으로 상단 카운터까지 날아가고 숫자 올라감 | 600ms |
| 진행 바 | 부드럽게 차오르고 끝에서 작은 반짝임 | 400ms |
| 탭 전환 | 선택된 탭 아이콘이 통통 튐 | 220ms |
| 모달·시트 | 아래에서 올라오며 살짝 튕김 | 280ms |
| 토스트 | 펫 말풍선 모양으로 톡 나타남 | 200ms |

- 이징 토큰: `ease-pop = cubic-bezier(.34,1.56,.64,1)`, `ease-out = cubic-bezier(.22,1,.36,1)`. 시간 토큰: fast 120ms, base 220ms, slow 400ms.
- UI 모션은 Motion(Framer Motion) 라이브러리, 스프라이트는 PixiJS ticker 또는 자체 requestAnimationFrame 루프.
- `prefers-reduced-motion`이면 흔들기, 튕김, 날아가기를 모두 짧은 페이드로 바꾸고 스프라이트는 첫 프레임만.
- 진동(지원 기기): 정답 짧게 1회, 오답 짧게 2회, 레벨업 길게. 설정에서 끌 수 있음.
- 효과음(선택): 정답, 별 획득, 레벨업 3종. 기본 켜짐, 설정에서 끔.

### 14.6 애니메이션 레지스트리와 콘솔

새 애니메이션 종류(예: 펫 "dance")를 코드 수정 없이 추가할 수 있게 테이블로 관리합니다.

```sql
create table animation_types (
  key text primary key,                 -- idle, walk, happy, dance ...
  target text not null check (target in ('avatar','pet','effect')),
  label text not null,
  required boolean not null default false,
  default_frames int not null, default_fps int not null,
  loop boolean not null default false
);
create table effects (
  key text primary key,                 -- star_pop, confetti ...
  storage_path text not null,
  frame_w int not null, frame_h int not null, frame_count int not null,
  fps int not null default 10, loop boolean not null default false,
  updated_by uuid references profiles, updated_at timestamptz not null default now()
);
```

- 아이템·펫 편집기의 업로드 칸은 `animation_types`에서 그 대상의 목록을 읽어 자동으로 만든다. 필수 애니메이션이 비어 있으면 게시 불가.
- 콘솔 "애니메이션" 메뉴(/console/animations, 어드민): 종류 추가·수정, 이펙트 시트 업로드, 이벤트 연결(anim_triggers) 편집.
- 미리보기 플레이어: 재생/정지, 프레임 하나씩, 속도 0.5배·1배·2배, 반복 토글, 다른 레이어와 겹쳐 보기.
- 구현 단계: 레지스트리와 대체 규칙은 4단계, 콘솔 메뉴는 5단계, 펫 행동 규칙과 특별 연출은 6단계.

## 15. UI 디자인 시스템 (귀엽게)

컨셉은 "말랑한 문구점"입니다. 파스텔 젤리 색, 굵은 외곽선의 스티커 같은 카드, 눌리면 말랑하게 들어가는 버튼, 숫자는 픽셀 폰트로 써서 픽셀 아트 캐릭터와 이어지게 합니다. 귀여움은 색과 모양과 모션에서 내고, 글자 대비와 터치 크기 같은 기본은 지킵니다.

### 15.1 색

| 토큰 | 라이트 | 다크 | 쓰임 |
| --- | --- | --- | --- |
| bg | #F3F0FF (라일락 우유) | #1E1A33 | 화면 배경 |
| surface | #FFFFFF | #2A2547 | 카드, 시트 |
| ink | #3A2E5C | #F4F0FF | 본문 글자, 외곽선 |
| ink-soft | #75699A | #B9B0DA | 보조 글자 |
| jelly (주색) | #8B7BFF | #A397FF | 주요 버튼, 선택 상태 |
| pink | #FF8FB8 | #FF9FC4 | 하트, 응원, 펫 |
| mint | #6FE3C1 | #6FE3C1 | 정답, 성장 |
| butter | #FFD960 | #FFD960 | 별조각, 강조 버튼 |
| peach | #FFB38A | #FFB38A | 불꽃, 스트릭 |
| sky | #8ED1FF | #8ED1FF | 정보, 공부방 |
| danger | #FF6B7A | #FF8591 | 오답, 경고 |

- 파스텔 색 위에 흰 글자를 쓰지 않는다. 글자는 항상 ink 계열로, 대비 4.5:1 이상.
- 정답·오답은 색만으로 구분하지 않고 아이콘(동그라미, 엑스)을 함께 쓴다.
- 버튼 그림자는 같은 색의 진한 버전(예: jelly → #6A59E6)으로 아래 4px.

### 15.2 글꼴

| 역할 | 글꼴 | 메모 |
| --- | --- | --- |
| 제목, 버튼 | Jua (Google Fonts) | 둥글고 통통한 한글 |
| 본문 | Pretendard | 가독성 |
| 숫자, 게임 수치 (XP, 별조각, D-day, 레벨) | Galmuri11 (픽셀 폰트, SIL OFL) | 직접 호스팅, 픽셀 아트와 통일감 |

크기 단계: 12 / 14 / 16(본문) / 20 / 24 / 32 / 40. 줄 간격 본문 1.55, 제목 1.2. 한국어 줄바꿈은 `word-break: keep-all`.

### 15.3 모양과 컴포넌트

- **스티커 카드:** 모서리 20px, ink 색 2.5px 외곽선, 아래쪽만 4px 단색 그림자. 흐린 그림자는 쓰지 않는다.
- **젤리 버튼:** 높이 52px(작은 버튼 40px), 모서리 16px, 굵은 외곽선 + 아래 그림자, 누르면 3px 내려감(14.5). 주요 버튼 jelly, 보상 관련 butter.
- **알약 칩:** 상단 스트릭·별조각 표시. 픽셀 아이콘 + Galmuri 숫자.
- **진행 바:** 높이 14px 캡슐, 외곽선 있음, 채움 끝에 작은 별. 단원 기억 진행 바는 mint, 레벨 바는 jelly.
- **확신도 버튼:** 픽셀 얼굴 아이콘 3개(자신만만, 갸우뚱, 눈 가림) + 글자 "확실해요 / 애매해요 / 모르겠어요".
- **펫 말풍선 토스트:** 알림과 안내는 화면 아래 펫이 말하는 말풍선으로. 문구는 짧고 구체적으로("별조각 5개 받았어요").
- **하단 탭:** 16×16 픽셀 아이콘(집, 책, 말풍선 둘, 하트, 소파)을 2배로. 선택된 탭은 아이콘이 통통 튀고 아래에 jelly 점.
- **빈 화면:** 펫이 해당 상황 포즈로 등장 + 할 일 한 줄 + 버튼 하나. 예: 오답노트가 비면 펫이 cheer, "틀린 문제가 생기면 여기 모여요".
- **로딩:** 펫이 책장 넘기는 4프레임 반복. AI 문제 생성처럼 긴 작업은 단계 표시("자료 읽는 중 → 문제 만드는 중 → 거의 다 됐어요").
- **아이콘:** 이모지 대신 아티스트가 그린 16×16 픽셀 아이콘 세트로 통일(약 40개). 콘솔에서 교체 가능하게 `effects`처럼 저장소에 둔다.

### 15.4 레이아웃과 접근성

- 학생 화면 최대 폭 480px 가운데 정렬, 좌우 여백 16px, 카드 사이 12px, 섹션 사이 24px.
- 터치 영역 최소 44×44px. 포커스 링은 jelly 3px.
- 다크 모드는 기기 설정을 따르고 설정에서 수동 전환 가능. 픽셀 아트 배경은 다크 모드에서 밤 하늘 창문 버전으로 교체 가능.
- 홈 화면의 주인공은 방 장면(아바타와 펫)이다. 다른 요소는 차분하게 두고 방 장면만 크게.

### 15.5 Tailwind 토큰 예시

```js
// tailwind.config.ts (발췌)
theme: {
  extend: {
    colors: {
      bg: 'rgb(var(--bg) / <alpha-value>)',
      surface: 'rgb(var(--surface) / <alpha-value>)',
      ink: 'rgb(var(--ink) / <alpha-value>)',
      jelly: 'rgb(var(--jelly) / <alpha-value>)',
      pink: '#FF8FB8', mint: '#6FE3C1', butter: '#FFD960', peach: '#FFB38A', sky: '#8ED1FF',
      danger: 'rgb(var(--danger) / <alpha-value>)',
    },
    borderRadius: { sticker: '20px', jelly: '16px' },
    boxShadow: { sticker: '0 4px 0 rgb(var(--ink))', jelly: '0 4px 0 #6A59E6' },
    fontFamily: { title: ['Jua', 'sans-serif'], body: ['Pretendard', 'sans-serif'], pixel: ['Galmuri11', 'monospace'] },
    transitionTimingFunction: { pop: 'cubic-bezier(.34,1.56,.64,1)' },
  },
}
```
