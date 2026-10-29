-- 3.5단계 스터디 그룹 확장 (SPEC 8.4, 8.5, 8.6): 참가, 단원 공유·가져오기, 통합 노트,
-- 주간 목표, 협동 보스전, 오답 구조대, 그룹 스트릭, 콕 찌르기, 소식·스티커.

insert into public.game_config (key, value, description) values
  ('group.max_members', '10', '그룹 최대 인원'),
  ('group.max_per_user', '3', '한 사람이 들어갈 수 있는 그룹 수'),
  ('group.goal_per_member', '50', '주간 목표: 그룹원 1명당 맞힐 문제 수'),
  ('group.goal_stars', '20', '주간 목표 달성 시 전원 별조각'),
  ('group.boss_hp_per_member', '60', '보스 HP: 그룹원 1명당'),
  ('group.boss_damage', '{"correct":1,"wrong_fixed":3,"overconfident_fixed":5}', '보스 대미지'),
  ('group.boss_stars', '15', '보스 처치 시 전원 별조각'),
  ('group.boss_names', '["중간고사 슬라임","수행평가 골렘","단어장 드래곤","모의고사 유령","기말고사 킹슬라임"]', '주마다 돌아가는 보스 이름'),
  ('group.streak_bonus_every', '7', '그룹 불꽃 보너스 주기(일)'),
  ('group.streak_stars', '10', '그룹 불꽃 보너스 별조각'),
  ('group.rescue_min_wrong', '2', '구조 대상이 되는 오답 그룹원 수'),
  ('ai.daily_merge_limit', '2', '하루 통합 노트 생성 횟수')
on conflict (key) do nothing;

-- 테이블 -------------------------------------------------------------------------
alter table public.study_groups
  add column invite_code char(6) unique,
  add column streak_count int not null default 0,
  add column streak_last date,
  add constraint study_groups_name_check check (char_length(name) between 1 and 20);

alter table public.group_members
  add column role text not null default 'member' check (role in ('owner', 'member')),
  add column joined_at timestamptz not null default now();

alter table public.group_goals
  add column completed_at timestamptz,
  add constraint group_goals_week_unique unique (group_id, week_start);

create table public.group_goal_contributions (
  goal_id uuid references public.group_goals on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  count int not null default 0,
  primary key (goal_id, user_id)
);

create table public.group_bosses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups on delete cascade,
  week_start date not null,
  boss_key text not null,
  name text not null,
  max_hp int not null check (max_hp > 0),
  hp int not null,
  defeated_at timestamptz,
  unique (group_id, week_start)
);

create table public.group_boss_hits (
  boss_id uuid references public.group_bosses on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  damage int not null default 0,
  primary key (boss_id, user_id)
);

-- 단원 공유 (8.5): 원문 공개는 올린 사람이 권리 확인과 함께 켜야 한다
create table public.deck_shares (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups on delete cascade,
  deck_id uuid not null references public.decks on delete cascade,
  shared_by uuid not null references public.profiles on delete cascade,
  share_material boolean not null default false,
  allow_merge boolean not null default true,
  rights_confirmed_at timestamptz,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  unique (group_id, deck_id),
  check (not share_material or rights_confirmed_at is not null)
);
create index deck_shares_deck_id_idx on public.deck_shares (deck_id);

alter table public.decks add column source_deck_id uuid references public.decks on delete set null;
create unique index decks_owner_source_idx on public.decks (owner_id, source_deck_id) where source_deck_id is not null;
alter table public.questions add column origin_question_id uuid references public.questions on delete set null;
create index questions_origin_idx on public.questions (origin_question_id);

create table public.group_notes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.study_groups on delete cascade,
  title text not null,
  subject text not null,
  content jsonb not null,           -- {"sections":[{"heading","points":[]}],"differences":[]}
  source_share_ids uuid[] not null,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);
create index group_notes_group_idx on public.group_notes (group_id, created_at desc);

-- 그룹 소식: 정해진 종류만. 자유 글은 없다 (원칙 4)
create table public.group_events (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.study_groups on delete cascade,
  actor_id uuid references public.profiles on delete set null,
  kind text not null check (kind in (
    'member.joined', 'deck.shared', 'note.created', 'goal.completed', 'boss.defeated',
    'rescue.saved', 'streak.up', 'poke'
  )),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index group_events_group_idx on public.group_events (group_id, created_at desc);

create table public.group_reactions (
  event_id bigint references public.group_events on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  sticker text not null check (sticker in ('clap', 'cheer', 'thanks', 'together')),
  primary key (event_id, user_id)
);

create table public.group_pokes (
  group_id uuid references public.study_groups on delete cascade,
  from_id uuid references public.profiles on delete cascade,
  to_id uuid references public.profiles on delete cascade,
  day date not null,
  primary key (group_id, from_id, to_id, day)
);

-- RLS: 그룹원만 읽고, 쓰기는 아래 함수로만 ---------------------------------------------
alter table public.group_goal_contributions enable row level security;
alter table public.group_bosses enable row level security;
alter table public.group_boss_hits enable row level security;
alter table public.deck_shares enable row level security;
alter table public.group_notes enable row level security;
alter table public.group_events enable row level security;
alter table public.group_reactions enable row level security;
alter table public.group_pokes enable row level security;

create policy group_goal_contributions_select on public.group_goal_contributions
  for select to authenticated
  using (exists (select 1 from public.group_goals g where g.id = goal_id and public.is_group_member(g.group_id)));
create policy group_bosses_select on public.group_bosses
  for select to authenticated using (public.is_group_member(group_id));
create policy group_boss_hits_select on public.group_boss_hits
  for select to authenticated
  using (exists (select 1 from public.group_bosses b where b.id = boss_id and public.is_group_member(b.group_id)));
create policy deck_shares_select on public.deck_shares
  for select to authenticated using (public.is_group_member(group_id) and (hidden_at is null or shared_by = auth.uid()));
create policy group_notes_select on public.group_notes
  for select to authenticated using (public.is_group_member(group_id));
create policy group_events_select on public.group_events
  for select to authenticated using (public.is_group_member(group_id));
create policy group_reactions_select on public.group_reactions
  for select to authenticated
  using (exists (select 1 from public.group_events e where e.id = event_id and public.is_group_member(e.group_id)));
create policy group_pokes_select on public.group_pokes
  for select to authenticated using (public.is_group_member(group_id));

revoke insert, update, delete on public.group_goal_contributions, public.group_bosses, public.group_boss_hits,
  public.deck_shares, public.group_notes, public.group_events, public.group_reactions, public.group_pokes
  from authenticated;

-- 공유된 단원은 그룹원이 문제를 읽을 수 있고, 원문은 share_material일 때만
create or replace function public.can_read_shared_deck(p_deck_id uuid, p_material boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.deck_shares s
    join public.group_members m on m.group_id = s.group_id and m.user_id = auth.uid()
    where s.deck_id = p_deck_id and s.hidden_at is null and (not p_material or s.share_material)
  );
$$;

create policy decks_select_shared on public.decks
  for select to authenticated using (public.can_read_shared_deck(id));
create policy questions_select_shared on public.questions
  for select to authenticated using (public.can_read_shared_deck(deck_id));
create policy materials_select_shared on public.materials
  for select to authenticated using (public.can_read_shared_deck(deck_id, true));

-- 헬퍼 ---------------------------------------------------------------------------
create or replace function public.week_start(p_now timestamptz default now())
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select date_trunc('week', public.app_day(p_now))::date;
$$;

create or replace function public.assert_social_allowed(p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.profiles where id = p_user_id and social_banned_until > now()) then
    raise exception 'social_banned' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.generate_group_code()
returns char(6)
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea;
  code text;
begin
  loop
    bytes := uuid_send(gen_random_uuid());
    code := '';
    for i in 0..5 loop
      code := code || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.study_groups where invite_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.group_event(p_group_id uuid, p_actor uuid, p_kind text, p_payload jsonb default '{}')
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.group_events (group_id, actor_id, kind, payload) values (p_group_id, p_actor, p_kind, p_payload);
$$;

-- 그룹 전원에게 별조각 (각자 일일 상한 적용)
create or replace function public.grant_group_stars(p_group_id uuid, p_amount int, p_reason text, p_ref text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in select user_id from public.group_members where group_id = p_group_id loop
    perform public.grant_stars(r.user_id, p_amount, p_reason, p_ref);
  end loop;
end;
$$;

-- 참가·나가기 ----------------------------------------------------------------------
create or replace function public.create_group(p_name text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_group uuid;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public.assert_social_allowed(uid);
  if (select count(*) from public.group_members where user_id = uid) >= public.config_int('group.max_per_user') then
    raise exception 'too_many_groups' using errcode = '22023';
  end if;
  insert into public.study_groups (name, owner_id, invite_code)
  values (btrim(p_name), uid, public.generate_group_code())
  returning id into v_group;
  insert into public.group_members (group_id, user_id, role) values (v_group, uid, 'owner');
  return v_group;
end;
$$;

create or replace function public.join_group(p_code text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_group uuid;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public.assert_social_allowed(uid);
  select id into v_group from public.study_groups where invite_code = upper(btrim(p_code)) for update;
  if not found then raise exception 'group_not_found' using errcode = '22023'; end if;
  if exists (select 1 from public.group_members where group_id = v_group and user_id = uid) then
    return v_group;
  end if;
  if (select count(*) from public.group_members where group_id = v_group) >= public.config_int('group.max_members') then
    raise exception 'group_full' using errcode = '22023';
  end if;
  if (select count(*) from public.group_members where user_id = uid) >= public.config_int('group.max_per_user') then
    raise exception 'too_many_groups' using errcode = '22023';
  end if;
  insert into public.group_members (group_id, user_id) values (v_group, uid);
  perform public.group_event(v_group, uid, 'member.joined');
  return v_group;
end;
$$;

-- 그룹장이 나가면 가장 먼저 들어온 그룹원에게 넘기고, 아무도 없으면 그룹을 지운다
create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_next uuid;
begin
  delete from public.group_members where group_id = p_group_id and user_id = uid;
  if not found then raise exception 'not_member' using errcode = '42501'; end if;
  -- 내가 공유한 단원은 그룹에서 내린다
  delete from public.deck_shares where group_id = p_group_id and shared_by = uid;
  if (select owner_id from public.study_groups where id = p_group_id) = uid then
    select user_id into v_next from public.group_members where group_id = p_group_id order by joined_at limit 1;
    if v_next is null then
      delete from public.study_groups where id = p_group_id;
    else
      update public.study_groups set owner_id = v_next where id = p_group_id;
      update public.group_members set role = 'owner' where group_id = p_group_id and user_id = v_next;
    end if;
  end if;
end;
$$;

-- 그룹원 목록: 닉네임은 항상 공개, 오늘 복습 여부는 privacy.status가 켜진 사람만 (8.1)
create or replace function public.group_member_list(p_group_id uuid)
returns table (user_id uuid, nickname text, role text, done_today boolean, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id, p.nickname, m.role,
    case when coalesce((p.privacy ->> 'status')::boolean, true) or m.user_id = auth.uid() then exists (
      select 1 from public.review_sessions s
      where s.user_id = m.user_id and s.completed_at >= public.app_day_start()
    ) end,
    m.user_id = auth.uid()
  from public.group_members m
  join public.profiles p on p.id = m.user_id
  where m.group_id = p_group_id and public.is_group_member(p_group_id)
  order by m.joined_at;
$$;

-- 단원 공유 ------------------------------------------------------------------------
create or replace function public.share_deck(
  p_group_id uuid, p_deck_id uuid, p_share_material boolean, p_allow_merge boolean, p_rights_confirmed boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_share uuid;
  v_title text;
begin
  perform public.assert_social_allowed(uid);
  if not public.is_group_member(p_group_id) then raise exception 'not_member' using errcode = '42501'; end if;
  select title into v_title from public.decks where id = p_deck_id and owner_id = uid and source_deck_id is null;
  if not found then raise exception 'deck_not_found' using errcode = '42501'; end if;
  if p_share_material and not coalesce(p_rights_confirmed, false) then
    raise exception 'rights_not_confirmed' using errcode = '22023';
  end if;

  insert into public.deck_shares (group_id, deck_id, shared_by, share_material, allow_merge, rights_confirmed_at)
  values (p_group_id, p_deck_id, uid, p_share_material, p_allow_merge, case when p_share_material then now() end)
  on conflict (group_id, deck_id) do update set
    share_material = excluded.share_material,
    allow_merge = excluded.allow_merge,
    rights_confirmed_at = coalesce(excluded.rights_confirmed_at, deck_shares.rights_confirmed_at)
  returning id into v_share;
  update public.decks set shared = true where id = p_deck_id;
  perform public.group_event(p_group_id, uid, 'deck.shared', jsonb_build_object('share_id', v_share, 'title', v_title));
  return v_share;
end;
$$;

-- 공유 중단: 공유한 사람 또는 그룹장
create or replace function public.unshare_deck(p_share_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.deck_shares;
begin
  select * into s from public.deck_shares where id = p_share_id;
  if not found or not (s.shared_by = auth.uid()
      or exists (select 1 from public.study_groups g where g.id = s.group_id and g.owner_id = auth.uid())) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from public.deck_shares where id = p_share_id;
  update public.decks set shared = exists (select 1 from public.deck_shares where deck_id = s.deck_id) where id = s.deck_id;
end;
$$;

-- 복사본 가져오기 (8.5). 새 카드 JSON은 서버(ts-fsrs)가 넘긴다. service_role 전용.
create or replace function public.import_shared_deck(p_user_id uuid, p_share_id uuid, p_new_card jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.deck_shares;
  src public.decks;
  v_deck uuid;
begin
  select * into s from public.deck_shares where id = p_share_id and hidden_at is null;
  if not found or not exists (select 1 from public.group_members where group_id = s.group_id and user_id = p_user_id) then
    raise exception 'share_not_found' using errcode = '42501';
  end if;
  select * into src from public.decks where id = s.deck_id;
  if src.owner_id = p_user_id then raise exception 'own_deck' using errcode = '22023'; end if;
  select id into v_deck from public.decks where owner_id = p_user_id and source_deck_id = src.id;
  if found then return v_deck; end if;

  insert into public.decks (owner_id, subject, title, mode, source_deck_id)
  values (p_user_id, src.subject, src.title, src.mode, src.id)
  returning id into v_deck;

  with copied as (
    insert into public.questions (deck_id, concept, type, prompt, options, answer, rubric, explanation, difficulty, origin_question_id)
    select v_deck, q.concept, q.type, q.prompt, q.options, q.answer, q.rubric, q.explanation, q.difficulty,
           coalesce(q.origin_question_id, q.id)
    from public.questions q where q.deck_id = src.id
    returning id
  )
  insert into public.card_states (user_id, question_id, fsrs, due)
  select p_user_id, copied.id, p_new_card, (p_new_card ->> 'due')::timestamptz from copied;
  return v_deck;
end;
$$;

-- 통합 노트 저장 (서버가 AI 결과를 넘긴다). 재료는 그룹의 allow_merge 공유만.
create or replace function public.save_group_note(
  p_user_id uuid, p_group_id uuid, p_title text, p_subject text, p_content jsonb, p_share_ids uuid[]
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_note uuid;
begin
  if not exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_user_id) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if (select count(*) from public.deck_shares where id = any (p_share_ids) and group_id = p_group_id
      and allow_merge and hidden_at is null) <> cardinality(p_share_ids) then
    raise exception 'invalid_sources' using errcode = '22023';
  end if;
  insert into public.group_notes (group_id, title, subject, content, source_share_ids, created_by)
  values (p_group_id, p_title, p_subject, p_content, p_share_ids, p_user_id)
  returning id into v_note;
  perform public.group_event(p_group_id, p_user_id, 'note.created', jsonb_build_object('note_id', v_note, 'title', p_title));
  return v_note;
end;
$$;

-- 콕 찌르기·스티커 -------------------------------------------------------------------
create or replace function public.poke_member(p_group_id uuid, p_to uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  perform public.assert_social_allowed(uid);
  if uid = p_to or not public.is_group_member(p_group_id)
     or not exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_to) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.review_sessions where user_id = p_to and completed_at >= public.app_day_start()) then
    raise exception 'already_done' using errcode = '22023';
  end if;
  insert into public.group_pokes (group_id, from_id, to_id, day) values (p_group_id, uid, p_to, public.app_day())
  on conflict do nothing;
  if not found then raise exception 'already_poked' using errcode = '22023'; end if;
  perform public.group_event(p_group_id, uid, 'poke', jsonb_build_object('to', p_to,
    'to_nickname', (select nickname from public.profiles where id = p_to)));
end;
$$;

create or replace function public.react_group_event(p_event_id bigint, p_sticker text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  perform public.assert_social_allowed(uid);
  if not exists (select 1 from public.group_events e where e.id = p_event_id and public.is_group_member(e.group_id)) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  insert into public.group_reactions (event_id, user_id, sticker) values (p_event_id, uid, p_sticker)
  on conflict (event_id, user_id) do update set sticker = excluded.sticker;
end;
$$;

-- 오답 구조대: 그룹원 N명 이상이 오답노트에 가진 공유 문제(원본 기준) ------------------------
create or replace function public.group_rescue_origins(p_group_id uuid)
returns table (origin_id uuid, wrong_members int)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(q.origin_question_id, q.id) as origin_id, count(distinct c.user_id)::int
  from public.card_states c
  join public.questions q on q.id = c.question_id
  join public.group_members m on m.user_id = c.user_id and m.group_id = p_group_id
  where c.in_wrong_note
    and coalesce(q.origin_question_id, q.id) in (
      select q2.id from public.questions q2
      join public.deck_shares s on s.deck_id = q2.deck_id and s.group_id = p_group_id and s.hidden_at is null
    )
  group by 1
  having count(distinct c.user_id) >= coalesce(public.config_int('group.rescue_min_wrong'), 2);
$$;

-- 구조 세트: 같이 잡을 문제 중 내 오답노트에 있는 것
create or replace function public.start_rescue_session(p_group_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_ids uuid[];
  v_session uuid;
begin
  if not public.is_group_member(p_group_id) then raise exception 'not_member' using errcode = '42501'; end if;
  select array_agg(c.question_id) into v_ids from (
    select c.question_id
    from public.card_states c
    join public.questions q on q.id = c.question_id
    where c.user_id = uid and c.in_wrong_note
      and coalesce(q.origin_question_id, q.id) in (select origin_id from public.group_rescue_origins(p_group_id))
    order by c.overconfident desc, c.last_wrong_at desc nulls last
    limit coalesce(public.config_int('review.set_size'), 10)
  ) c;
  if v_ids is null then return null; end if;
  insert into public.review_sessions (user_id, kind, question_ids) values (uid, 'rescue', v_ids)
  returning id into v_session;
  return v_session;
end;
$$;

-- 주간 목표·보스 준비 -------------------------------------------------------------------
create or replace function public.ensure_group_week(p_group_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_week date := public.week_start();
  v_members int;
  v_names jsonb := public.config_value('group.boss_names');
  v_idx int;
begin
  select count(*) into v_members from public.group_members where group_id = p_group_id;
  insert into public.group_goals (group_id, week_start, target)
  values (p_group_id, v_week, greatest(v_members, 1) * public.config_int('group.goal_per_member'))
  on conflict (group_id, week_start) do nothing;

  v_idx := ((v_week - date '2026-01-05') / 7) % greatest(jsonb_array_length(coalesce(v_names, '[]')), 1);
  insert into public.group_bosses (group_id, week_start, boss_key, name, max_hp, hp)
  values (
    p_group_id, v_week, 'boss_' || v_idx,
    coalesce(v_names ->> v_idx, '시험 몬스터'),
    greatest(v_members, 1) * public.config_int('group.boss_hp_per_member'),
    greatest(v_members, 1) * public.config_int('group.boss_hp_per_member')
  )
  on conflict (group_id, week_start) do nothing;
end;
$$;

-- 학습 이벤트 훅 (3단계 on_study_events 교체) ---------------------------------------------
create or replace function public.on_study_events(p_user_id uuid, p_events text[], p_ref text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  g record;
  v_goal public.group_goals;
  v_boss public.group_bosses;
  v_damage jsonb := public.config_value('group.boss_damage');
  v_hit int := 0;
  v_out_events text[] := '{}';
  v_groups jsonb := '[]'::jsonb;
  v_question uuid;
  v_origin uuid;
  v_concept text;
  v_today date := public.app_day();
  v_all_done boolean;
  v_grp public.study_groups;
  v_count int;
begin
  -- 맞힌 양 기준: XP를 받은 정답만 목표·보스에 센다
  if 'xp.gained' = any (p_events) then
    v_hit := case
      when 'wrong.overconfident_fixed' = any (p_events) then (v_damage ->> 'overconfident_fixed')::int
      when 'wrong.fixed' = any (p_events) then (v_damage ->> 'wrong_fixed')::int
      else (v_damage ->> 'correct')::int
    end;
  end if;

  if p_ref like 'attempt:%' then
    select a.question_id into v_question from public.attempts a where a.id = substr(p_ref, 9)::bigint;
    select coalesce(q.origin_question_id, q.id), q.concept into v_origin, v_concept from public.questions q where q.id = v_question;
  end if;

  for g in select group_id from public.group_members where user_id = p_user_id loop
    perform public.ensure_group_week(g.group_id);

    if v_hit > 0 then
      -- 주간 목표: 맞힌 문제 1개 = 1
      update public.group_goals set progress = progress + 1
        where group_id = g.group_id and week_start = public.week_start()
        returning * into v_goal;
      insert into public.group_goal_contributions (goal_id, user_id, count) values (v_goal.id, p_user_id, 1)
        on conflict (goal_id, user_id) do update set count = group_goal_contributions.count + 1;
      if v_goal.progress >= v_goal.target and v_goal.completed_at is null then
        update public.group_goals set completed_at = now() where id = v_goal.id;
        perform public.grant_group_stars(g.group_id, public.config_int('group.goal_stars'), 'group_goal', v_goal.id::text);
        if v_goal.reward_item_id is not null then
          insert into public.inventory (user_id, item_id, source)
          select user_id, v_goal.reward_item_id, 'group_goal' from public.group_members where group_id = g.group_id
          on conflict do nothing;
        end if;
        perform public.group_event(g.group_id, p_user_id, 'goal.completed', jsonb_build_object('target', v_goal.target));
        v_out_events := array_append(v_out_events, 'group.goal_complete');
      end if;

      -- 보스: 대미지
      update public.group_bosses set hp = greatest(hp - v_hit, 0)
        where group_id = g.group_id and week_start = public.week_start() and defeated_at is null
        returning * into v_boss;
      if v_boss.id is not null then
        insert into public.group_boss_hits (boss_id, user_id, damage) values (v_boss.id, p_user_id, v_hit)
          on conflict (boss_id, user_id) do update set damage = group_boss_hits.damage + v_hit;
        v_out_events := array_append(v_out_events, 'group.boss_hit');
        if v_boss.hp = 0 then
          update public.group_bosses set defeated_at = now() where id = v_boss.id;
          perform public.grant_group_stars(g.group_id, public.config_int('group.boss_stars'), 'group_boss', v_boss.id::text);
          perform public.group_event(g.group_id, p_user_id, 'boss.defeated', jsonb_build_object('name', v_boss.name));
          v_out_events := array_append(v_out_events, 'group.boss_defeated');
        end if;
      end if;

      -- 구조대: 같이 잡을 문제를 교정
      if v_origin is not null and ('wrong.fixed' = any (p_events) or 'wrong.overconfident_fixed' = any (p_events))
         and exists (
           select 1 from public.questions q2
           join public.deck_shares s on s.deck_id = q2.deck_id and s.group_id = g.group_id and s.hidden_at is null
           where q2.id = v_origin
         ) then
        -- 이 문제를 오답노트에 가진 다른 그룹원이 있을 때만 "구조"로 친다
        if exists (
          select 1 from public.card_states c
          join public.questions q on q.id = c.question_id
          join public.group_members m on m.user_id = c.user_id and m.group_id = g.group_id
          where c.in_wrong_note and c.user_id <> p_user_id and coalesce(q.origin_question_id, q.id) = v_origin
        ) then
          perform public.group_event(g.group_id, p_user_id, 'rescue.saved', jsonb_build_object('concept', v_concept));
          v_out_events := array_append(v_out_events, 'group.rescue');
        end if;
      end if;
    end if;

    -- 그룹 불꽃: 그룹원 모두 오늘 세트를 끝냈으면 +1 (하루 한 번)
    if 'set.complete' = any (p_events) then
      select * into v_grp from public.study_groups where id = g.group_id for update;
      if v_grp.streak_last is distinct from v_today then
        select bool_and(exists (
          select 1 from public.review_sessions s where s.user_id = m.user_id and s.completed_at >= public.app_day_start()
        )) into v_all_done
        from public.group_members m where m.group_id = g.group_id;
        if v_all_done then
          v_count := case when v_grp.streak_last = v_today - 1 then v_grp.streak_count + 1 else 1 end;
          update public.study_groups set streak_count = v_count, streak_last = v_today where id = g.group_id;
          perform public.group_event(g.group_id, p_user_id, 'streak.up', jsonb_build_object('streak', v_count));
          v_out_events := array_append(v_out_events, 'group.streak_up');
          if v_count % greatest(public.config_int('group.streak_bonus_every'), 1) = 0 then
            perform public.grant_group_stars(g.group_id, public.config_int('group.streak_stars'), 'group_streak', v_count::text);
          end if;
        end if;
      end if;
    end if;

    v_groups := v_groups || jsonb_build_object(
      'group_id', g.group_id,
      'boss_hp', (select hp from public.group_bosses where group_id = g.group_id and week_start = public.week_start()),
      'goal_progress', (select progress from public.group_goals where group_id = g.group_id and week_start = public.week_start())
    );
  end loop;

  return jsonb_build_object('events', to_jsonb(v_out_events), 'groups', v_groups);
end;
$$;

-- daily_rollover에 그룹 불꽃 정리를 더한다
create or replace function public.daily_rollover()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id from public.profiles where streak_last < public.app_day() - 1 and streak_count > 0
  loop
    perform public.apply_streak_gap(r.id);
    n := n + 1;
  end loop;
  update public.study_groups set streak_count = 0
    where streak_count > 0 and streak_last < public.app_day() - 1;
  return n;
end;
$$;

-- 권한 ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  -- 로그인한 학생이 직접 부르는 함수 (안에서 auth.uid()와 그룹원 여부를 확인)
  foreach f in array array[
    'public.create_group(text)', 'public.join_group(text)', 'public.leave_group(uuid)',
    'public.group_member_list(uuid)', 'public.share_deck(uuid, uuid, boolean, boolean, boolean)',
    'public.unshare_deck(uuid)', 'public.poke_member(uuid, uuid)', 'public.react_group_event(bigint, text)',
    'public.start_rescue_session(uuid)', 'public.group_rescue_origins(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- 서버 전용
  foreach f in array array[
    'public.import_shared_deck(uuid, uuid, jsonb)', 'public.save_group_note(uuid, uuid, text, text, jsonb, uuid[])',
    'public.grant_group_stars(uuid, int, text, text)', 'public.ensure_group_week(uuid)',
    'public.group_event(uuid, uuid, text, jsonb)', 'public.on_study_events(uuid, text[], text)',
    'public.daily_rollover()', 'public.generate_group_code()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;
