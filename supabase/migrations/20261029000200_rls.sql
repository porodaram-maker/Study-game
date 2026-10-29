-- SPEC 3장·12장 권한. 모든 테이블 RLS를 켜고, 잔액·XP·역할처럼 클라이언트가 직접 바꾸면 안 되는
-- 값은 정책을 두지 않거나 컬럼 권한을 빼서 security definer 함수로만 바뀌게 한다.
-- 이 단계에서 쓰기 정책이 없는 테이블은 이후 단계의 서버 함수가 쓴다.

-- 역할 헬퍼 -------------------------------------------------------------------
create or replace function public.current_role_of(uid uuid)
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = uid;
$$;

create or replace function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('editor', 'admin')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- 학생에게 보이는 아이템: 게시됨 + 예약 시각 지남 + (시즌 없음 또는 게시된 시즌 기간 안)
create or replace function public.is_item_public(p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.items i
    left join public.seasons s on s.id = i.season_id
    where i.id = p_item_id
      and i.status = 'published'
      and (i.publish_at is null or i.publish_at <= now())
      and (
        i.season_id is null
        or (s.status = 'published' and now() >= s.starts_at and now() < s.ends_at)
      )
  );
$$;

-- 아이템 읽기: 공개 아이템, 내가 가진 아이템(보관돼도 계속 착용), 에디터 이상
create or replace function public.can_read_item(p_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_item_public(p_item_id)
    or exists (select 1 from public.inventory where user_id = auth.uid() and item_id = p_item_id)
    or public.is_editor();
$$;

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members where group_id = p_group_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_league_member(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.league_members where league_id = p_league_id and user_id = auth.uid()
  );
$$;

revoke execute on function public.current_role_of(uuid) from public, anon, authenticated;

-- RLS 켜기 --------------------------------------------------------------------
alter table public.schools enable row level security;
alter table public.profiles enable row level security;
alter table public.exams enable row level security;
alter table public.decks enable row level security;
alter table public.materials enable row level security;
alter table public.questions enable row level security;
alter table public.card_states enable row level security;
alter table public.attempts enable row level security;
alter table public.star_ledger enable row level security;
alter table public.xp_ledger enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.seasons enable row level security;
alter table public.item_slots enable row level security;
alter table public.animation_types enable row level security;
alter table public.items enable row level security;
alter table public.item_sprites enable row level security;
alter table public.pet_species enable row level security;
alter table public.inventory enable row level security;
alter table public.equipped enable row level security;
alter table public.user_pets enable row level security;
alter table public.room_layouts enable row level security;
alter table public.friendships enable row level security;
alter table public.cheers enable row level security;
alter table public.study_rooms enable row level security;
alter table public.duels enable row level security;
alter table public.study_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_goals enable row level security;
alter table public.game_config enable row level security;
alter table public.announcements enable row level security;
alter table public.reports enable row level security;
alter table public.ai_usage enable row level security;
alter table public.audit_logs enable row level security;
alter table public.effects enable row level security;

-- 비로그인(anon)은 렌더링용 공개 레지스트리 외에는 아무 권한도 없다.
revoke all on all tables in schema public from anon;
grant select on public.item_slots, public.animation_types, public.effects to anon;

-- 사용자 ----------------------------------------------------------------------
create policy schools_select on public.schools
  for select to authenticated using (true);

create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());

-- 본인이 바꿀 수 있는 컬럼만 열어 둔다. 닉네임·역할·XP·별조각·스트릭은 서버 함수로만.
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from authenticated;
grant update (grade, league_opt_out, privacy, settings) on public.profiles to authenticated;

-- 학습 (본인만) ----------------------------------------------------------------
create policy exams_own on public.exams
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy decks_own on public.decks
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy materials_own on public.materials
  for all to authenticated
  using (exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = auth.uid()));

create policy questions_own on public.questions
  for all to authenticated
  using (exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = auth.uid()))
  with check (exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = auth.uid()));

-- 채점·FSRS 갱신은 submit_answer 함수가 한다 (2단계).
create policy card_states_select_own on public.card_states
  for select to authenticated using (user_id = auth.uid());
create policy attempts_select_own on public.attempts
  for select to authenticated using (user_id = auth.uid());
revoke insert, delete on public.card_states, public.attempts from authenticated;
revoke update on public.card_states, public.attempts from authenticated;
-- 실수 유형 고르기(5.4)만 본인이 직접 쓴다.
create policy attempts_update_mistake_own on public.attempts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant update (mistake_type) on public.attempts to authenticated;

-- 게임 (원장은 읽기만) ------------------------------------------------------------
create policy star_ledger_select on public.star_ledger
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy xp_ledger_select on public.xp_ledger
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.star_ledger, public.xp_ledger from authenticated;

create policy leagues_select on public.leagues
  for select to authenticated using (true);
create policy league_members_select on public.league_members
  for select to authenticated using (public.is_league_member(league_id));
revoke insert, update, delete on public.leagues, public.league_members from authenticated;

-- 아이템 ----------------------------------------------------------------------
create policy seasons_select on public.seasons
  for select to authenticated using (status = 'published' or public.is_editor());

create policy item_slots_select on public.item_slots
  for select to anon, authenticated using (true);
create policy animation_types_select on public.animation_types
  for select to anon, authenticated using (true);
create policy effects_select on public.effects
  for select to anon, authenticated using (true);

create policy items_select on public.items
  for select to authenticated using (public.can_read_item(id));
create policy item_sprites_select on public.item_sprites
  for select to authenticated using (public.can_read_item(item_id));
create policy pet_species_select on public.pet_species
  for select to authenticated using (public.can_read_item(item_id));

-- 콘텐츠 쓰기는 감사 로그와 함께 콘솔 서버 함수가 한다 (5단계).
revoke insert, update, delete on public.seasons, public.item_slots, public.animation_types,
  public.effects, public.items, public.item_sprites, public.pet_species from authenticated;

-- 보유·착용·펫·방: 구매/착용/간식은 서버 함수(6단계)로.
create policy inventory_select_own on public.inventory
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy equipped_select_own on public.equipped
  for select to authenticated using (user_id = auth.uid());
create policy user_pets_select_own on public.user_pets
  for select to authenticated using (user_id = auth.uid());
create policy room_layouts_select_own on public.room_layouts
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.inventory, public.equipped, public.user_pets,
  public.room_layouts from authenticated;

-- 소셜 (당사자만 읽기, 쓰기는 7·8단계 서버 함수) --------------------------------------
create policy friendships_select on public.friendships
  for select to authenticated using (auth.uid() in (user_a, user_b));
create policy cheers_select on public.cheers
  for select to authenticated using (auth.uid() in (from_id, to_id));
create policy study_rooms_select on public.study_rooms
  for select to authenticated using (host_id = auth.uid());
create policy duels_select on public.duels
  for select to authenticated using (auth.uid() in (a_id, b_id));
create policy study_groups_select on public.study_groups
  for select to authenticated using (owner_id = auth.uid() or public.is_group_member(id));
create policy group_members_select on public.group_members
  for select to authenticated using (public.is_group_member(group_id));
create policy group_goals_select on public.group_goals
  for select to authenticated using (public.is_group_member(group_id));
revoke insert, update, delete on public.friendships, public.cheers, public.study_rooms,
  public.duels, public.study_groups, public.group_members, public.group_goals from authenticated;

-- 운영 ------------------------------------------------------------------------
create policy game_config_select on public.game_config
  for select to authenticated using (true);
revoke insert, update, delete on public.game_config from authenticated;

create policy announcements_select on public.announcements
  for select to authenticated using (
    (status = 'published'
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at > now()))
    or public.is_editor()
  );
revoke insert, update, delete on public.announcements from authenticated;

create policy reports_insert_own on public.reports
  for insert to authenticated with check (reporter_id = auth.uid() and status = 'open' and handled_by is null);
create policy reports_select on public.reports
  for select to authenticated using (reporter_id = auth.uid() or public.is_editor());
revoke update, delete on public.reports from authenticated;

create policy ai_usage_select on public.ai_usage
  for select to authenticated using (user_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.ai_usage from authenticated;

-- 감사 로그: insert만, 수정·삭제 불가 (9.10). 에디터는 본인 기록, 어드민은 전체.
create policy audit_logs_select on public.audit_logs
  for select to authenticated using (public.is_admin() or (public.is_editor() and actor_id = auth.uid()));
create policy audit_logs_insert on public.audit_logs
  for insert to authenticated with check (actor_id = auth.uid() and public.is_editor());
revoke update, delete, truncate on public.audit_logs from authenticated, anon;
