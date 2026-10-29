-- SPEC 4장 + 14.6 스키마. 참조되는 테이블을 먼저 만든다.
-- RLS 정책은 20261029000200_rls.sql, 온보딩 함수는 20261029000300_onboarding.sql.

-- 공통 ------------------------------------------------------------------------
create type public.user_role as enum ('student', 'editor', 'admin');
create type public.content_status as enum ('draft', 'published', 'archived');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 사용자 ----------------------------------------------------------------------
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text
);

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  nickname text not null unique check (char_length(nickname) between 2 and 12),
  grade smallint check (grade between 1 and 3),
  school_id uuid references public.schools,           -- 선택, 인증 시에만
  role public.user_role not null default 'student',
  xp int not null default 0,
  stars int not null default 0 check (stars >= 0),
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
create index profiles_school_id_idx on public.profiles (school_id);
create index profiles_role_idx on public.profiles (role) where role <> 'student';

-- 학습 ------------------------------------------------------------------------
create table public.exams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  name text not null,
  exam_date date not null,
  scope jsonb
);
create index exams_user_id_idx on public.exams (user_id, exam_date);

create table public.decks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles on delete cascade,
  subject text not null,
  title text not null,
  mode text not null check (mode in ('naesin', 'suneung')),
  exam_id uuid references public.exams on delete set null,
  shared boolean not null default false,
  created_at timestamptz not null default now()
);
create index decks_owner_id_idx on public.decks (owner_id);
create index decks_exam_id_idx on public.decks (exam_id);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks on delete cascade,
  storage_path text,
  extracted_text text,
  content_hash text,                                  -- 같은 자료 재사용 판단
  created_at timestamptz not null default now()
);
create index materials_deck_id_idx on public.materials (deck_id);
create index materials_content_hash_idx on public.materials (content_hash);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks on delete cascade,
  concept text not null,
  type text not null check (type in ('mcq', 'blank', 'ox_reason', 'essay', 'explain')),
  prompt text not null,
  options jsonb,              -- mcq: 4개 문자열
  answer jsonb not null,      -- 유형별 정답 구조
  rubric jsonb,               -- 서술형 채점 기준
  explanation text not null,
  difficulty smallint default 2
);
create index questions_deck_id_idx on public.questions (deck_id);

create table public.card_states (     -- 사용자별 FSRS 상태
  user_id uuid references public.profiles on delete cascade,
  question_id uuid references public.questions on delete cascade,
  fsrs jsonb not null,                -- ts-fsrs Card 객체
  due timestamptz not null,
  in_wrong_note boolean not null default false,
  overconfident boolean not null default false,
  primary key (user_id, question_id)
);
create index card_states_user_due_idx on public.card_states (user_id, due);
create index card_states_question_id_idx on public.card_states (question_id);

create table public.attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,
  question_id uuid not null references public.questions on delete cascade,
  correct boolean not null,
  confidence text not null check (confidence in ('sure', 'maybe', 'guess')),
  picked jsonb,
  mistake_type text,
  duration_ms int,
  created_at timestamptz not null default now()
);
create index attempts_user_created_idx on public.attempts (user_id, created_at desc);
create index attempts_question_id_idx on public.attempts (question_id);

-- 게임 ------------------------------------------------------------------------
create table public.star_ledger (     -- 모든 별조각 증감 기록 (잔액은 profiles.stars)
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,
  delta int not null,
  reason text not null,               -- review_set, wrong_fixed, purchase, admin_adjust ...
  ref_id text,
  created_at timestamptz not null default now()
);
create index star_ledger_user_created_idx on public.star_ledger (user_id, created_at desc);

-- SPEC은 `like star_ledger including all`이지만 LIKE는 외래키를 복사하지 않아 직접 정의한다.
create table public.xp_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,
  delta int not null,
  reason text not null,
  ref_id text,
  created_at timestamptz not null default now()
);
create index xp_ledger_user_created_idx on public.xp_ledger (user_id, created_at desc);

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  tier text not null
);
create index leagues_week_tier_idx on public.leagues (week_start, tier);

create table public.league_members (
  league_id uuid references public.leagues on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  weekly_xp int not null default 0,
  result text,
  primary key (league_id, user_id)
);
create index league_members_user_id_idx on public.league_members (user_id);

-- 아이템 (에디터가 관리) --------------------------------------------------------
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  banner_path text,
  status public.content_status not null default 'draft',
  check (ends_at > starts_at)
);

create table public.item_slots (       -- back, hair_back, body, ... (7.2)
  key text primary key,
  label text not null,
  z_index int not null,
  category text not null check (category in ('avatar', 'pet', 'room'))
);

create table public.animation_types (  -- 14.6 애니메이션 레지스트리
  key text primary key,                -- idle, walk, happy, dance ...
  target text not null check (target in ('avatar', 'pet', 'effect')),
  label text not null,
  required boolean not null default false,
  default_frames int not null,
  default_fps int not null,
  loop boolean not null default false
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  slot_key text not null references public.item_slots,
  name text not null,
  description text,
  rarity text not null default 'common',
  price_stars int not null default 0 check (price_stars >= 0),
  unlock_rule jsonb,            -- 예: {"level":10} 또는 {"streak":30} 또는 {"season":"..."}
  season_id uuid references public.seasons,
  status public.content_status not null default 'draft',
  publish_at timestamptz,       -- 예약 게시
  sort_order int not null default 0,
  tags text[] not null default '{}',
  created_by uuid references public.profiles,
  updated_by uuid references public.profiles,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_slot_key_idx on public.items (slot_key);
create index items_status_sort_idx on public.items (status, sort_order);
create index items_season_id_idx on public.items (season_id);
create trigger items_set_updated_at before update on public.items
  for each row execute function public.set_updated_at();

create table public.item_sprites (     -- 한 아이템의 레이어·애니메이션별 스프라이트 시트
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items on delete cascade,
  layer text not null default 'main',  -- main, back, effect 등
  animation text not null,             -- animation_types.key (14.6)
  storage_path text not null,
  frame_w int not null check (frame_w > 0),
  frame_h int not null check (frame_h > 0),
  frame_count int not null check (frame_count > 0),
  fps int not null default 6 check (fps > 0),
  offset_x int not null default 0,
  offset_y int not null default 0,
  z_override int
);
create index item_sprites_item_id_idx on public.item_sprites (item_id);

create table public.pet_species (
  item_id uuid primary key references public.items on delete cascade,
  stages jsonb not null           -- [{"name":"아기","min_xp":0},{"name":"꼬마","min_xp":300},{"name":"어른","min_xp":1200}]
);

create table public.inventory (
  user_id uuid references public.profiles on delete cascade,
  item_id uuid references public.items on delete restrict,
  acquired_at timestamptz not null default now(),
  source text not null,
  primary key (user_id, item_id)
);
create index inventory_item_id_idx on public.inventory (item_id);

create table public.equipped (
  user_id uuid references public.profiles on delete cascade,
  slot_key text references public.item_slots,
  item_id uuid references public.items,
  primary key (user_id, slot_key)
);
create index equipped_item_id_idx on public.equipped (item_id);

create table public.user_pets (
  user_id uuid references public.profiles on delete cascade,
  item_id uuid references public.items,
  nickname text,
  pet_xp int not null default 0,
  last_cared date,
  active boolean not null default false,
  primary key (user_id, item_id)
);
create index user_pets_item_id_idx on public.user_pets (item_id);
create unique index user_pets_one_active_idx on public.user_pets (user_id) where active;

create table public.room_layouts (
  user_id uuid primary key references public.profiles on delete cascade,
  layout jsonb not null default '[]'  -- [{"item_id":"...","x":3,"y":5,"flip":false}]
);

-- 소셜 ------------------------------------------------------------------------
create table public.friendships (
  user_a uuid references public.profiles on delete cascade,
  user_b uuid references public.profiles on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'blocked')),
  requested_by uuid not null references public.profiles on delete cascade,
  friend_streak int not null default 0,
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index friendships_user_b_idx on public.friendships (user_b);

create table public.cheers (
  id bigint generated always as identity primary key,
  from_id uuid references public.profiles on delete cascade,
  to_id uuid references public.profiles on delete cascade,
  sticker text,
  created_at timestamptz default now()
);
create index cheers_to_created_idx on public.cheers (to_id, created_at desc);
create index cheers_from_created_idx on public.cheers (from_id, created_at desc);

create table public.study_rooms (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles on delete cascade,
  invite_code text unique,
  timer jsonb,
  created_at timestamptz default now(),
  closed_at timestamptz
);
create index study_rooms_host_id_idx on public.study_rooms (host_id);

create table public.duels (
  id uuid primary key default gen_random_uuid(),
  a_id uuid references public.profiles on delete cascade,
  b_id uuid references public.profiles on delete cascade,
  question_ids uuid[],
  scores jsonb,
  status text,
  created_at timestamptz default now()
);
create index duels_a_id_idx on public.duels (a_id);
create index duels_b_id_idx on public.duels (b_id);

create table public.study_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz default now()
);
create index study_groups_owner_id_idx on public.study_groups (owner_id);

create table public.group_members (
  group_id uuid references public.study_groups on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  primary key (group_id, user_id)
);
create index group_members_user_id_idx on public.group_members (user_id);

create table public.group_goals (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.study_groups on delete cascade,
  week_start date,
  target int,
  progress int default 0,
  reward_item_id uuid references public.items
);
create index group_goals_group_week_idx on public.group_goals (group_id, week_start);

-- 운영 ------------------------------------------------------------------------
create table public.game_config (       -- 어드민이 바꾸는 수치 (6.1)
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references public.profiles,
  updated_at timestamptz not null default now()
);
create trigger game_config_set_updated_at before update on public.game_config
  for each row execute function public.set_updated_at();

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text,
  body text,
  starts_at timestamptz,
  ends_at timestamptz,
  status public.content_status default 'draft'
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles on delete set null,
  target_type text,
  target_id text,
  reason text,
  status text default 'open',
  handled_by uuid references public.profiles on delete set null,
  created_at timestamptz default now()
);
create index reports_status_created_idx on public.reports (status, created_at desc);
create index reports_reporter_id_idx on public.reports (reporter_id);

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles on delete set null,
  kind text,
  model text,
  input_tokens int,
  output_tokens int,
  created_at timestamptz default now()
);
create index ai_usage_user_created_idx on public.ai_usage (user_id, created_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles,
  action text not null,          -- item.create, item.publish, config.update, user.ban, stars.adjust, role.grant ...
  target_type text,
  target_id text,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index audit_logs_actor_created_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_action_idx on public.audit_logs (action);
create index audit_logs_target_idx on public.audit_logs (target_type, target_id);

create table public.effects (           -- 14.6 공용 이펙트 시트
  key text primary key,                 -- star_pop, confetti ...
  storage_path text not null,
  frame_w int not null,
  frame_h int not null,
  frame_count int not null,
  fps int not null default 10,
  loop boolean not null default false,
  updated_by uuid references public.profiles,
  updated_at timestamptz not null default now()
);
create trigger effects_set_updated_at before update on public.effects
  for each row execute function public.set_updated_at();
