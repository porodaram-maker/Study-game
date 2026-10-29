-- 3단계 게임 시스템: 설정값(6.1), XP·별조각 원장과 지급 함수, 일일 상한, 레벨, 스트릭·보호권, daily_rollover.
-- 보상 지급은 전부 서버 함수에서만 한다 (6.2). 클라이언트는 풀었다는 사실만 보낸다.

-- 6.1 기본 설정값 ------------------------------------------------------------------
insert into public.game_config (key, value, description) values
  ('xp.correct', '10', '정답'),
  ('xp.wrong_fixed', '20', '오답노트 문제 다시 맞힘'),
  ('xp.overconfident_fixed', '30', '확실했는데 틀린 문제 교정'),
  ('xp.explain_done', '50', '설명하기 통과'),
  ('stars.review_set', '5', '복습 세트 완료'),
  ('stars.wrong_fixed', '3', '오답 다시 맞힘'),
  ('stars.overconfident_fixed', '5', '확실했는데 틀린 문제 교정'),
  ('stars.explain_done', '15', '설명하기 통과'),
  ('stars.streak_7', '20', '스트릭 streak.bonus_every일마다'),
  ('stars.room_session', '5', '같이 공부방 25분 완료'),
  ('stars.cheer_received', '2', '응원 받음 (하루 최대 5회분)'),
  ('stars.daily_cap', '60', '하루 별조각 획득 상한'),
  ('streak.freeze_every', '7', '보호권 지급 주기(일)'),
  ('streak.freeze_max', '2', '보호권 최대 보관'),
  ('streak.bonus_every', '7', '스트릭 별조각 보너스 주기(일)'),
  ('level.base', '100', '레벨 1→2 필요 XP'),
  ('level.step', '50', '레벨마다 늘어나는 필요 XP'),
  ('league.size', '30', '주간 리그 인원'),
  ('league.promote', '7', '승급 인원'),
  ('league.demote', '5', '강등 인원'),
  ('notify.quiet_hours', '{"start":23,"end":6}', '알림 금지 시간 (KST)'),
  ('exam.boost_days', '7', '시험 며칠 전부터 대비 세트를 추천할지'),
  ('anim_triggers', '{"review.correct":"happy","review.wrong":"encourage","set.complete":"cheer","cheer.received":"cheer","pet.fed":"eat"}', '이벤트 → 애니메이션 연결 (14.1)')
on conflict (key) do nothing;

create or replace function public.config_int(p_key text)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select (value #>> '{}')::int from public.game_config where key = p_key;
$$;

-- 앱의 "오늘" 날짜 (KST 새벽 4시 경계)
create or replace function public.app_day(p_now timestamptz default now())
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (public.app_day_start(p_now) at time zone 'Asia/Seoul')::date;
$$;

-- 레벨 (6.1): 레벨 n→n+1 필요 XP = base + (n-1)×step. lib/game/level.ts와 같은 식.
create or replace function public.level_for_xp(p_xp int)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base int := coalesce(public.config_int('level.base'), 100);
  v_step int := coalesce(public.config_int('level.step'), 50);
  v_level int := 1;
  v_left int := greatest(p_xp, 0);
begin
  while v_left >= v_base + (v_level - 1) * v_step loop
    v_left := v_left - (v_base + (v_level - 1) * v_step);
    v_level := v_level + 1;
  end loop;
  return v_level;
end;
$$;

-- 원장 지급 함수 -------------------------------------------------------------------
-- XP: 원장 기록 + 잔액 갱신을 한 트랜잭션에서. 레벨이 오르면 level_up = true.
create or replace function public.grant_xp(p_user_id uuid, p_delta int, p_reason text, p_ref text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_before int;
  v_after int;
begin
  if p_delta is null or p_delta = 0 then
    return jsonb_build_object('xp', 0, 'level_up', false);
  end if;
  select xp into v_before from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'profile_not_found' using errcode = '42501';
  end if;
  insert into public.xp_ledger (user_id, delta, reason, ref_id) values (p_user_id, p_delta, p_reason, p_ref);
  update public.profiles set xp = greatest(0, xp + p_delta) where id = p_user_id returning xp into v_after;
  return jsonb_build_object(
    'xp', p_delta,
    'level', public.level_for_xp(v_after),
    'level_up', public.level_for_xp(v_after) > public.level_for_xp(v_before)
  );
end;
$$;

-- 별조각 지급. p_capped면 오늘(KST 4시 기준) 상한(stars.daily_cap)까지만 준다. 실제 지급량을 돌려준다.
create or replace function public.grant_stars(
  p_user_id uuid, p_delta int, p_reason text, p_ref text default null, p_capped boolean default true
)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_earned int;
  v_grant int := p_delta;
begin
  if p_delta is null or p_delta <= 0 then
    return 0;
  end if;
  -- 같은 사용자의 동시 지급이 상한을 넘지 않게 프로필 행을 잠근다
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'profile_not_found' using errcode = '42501';
  end if;

  if p_capped then
    select coalesce(sum(delta), 0) into v_earned
    from public.star_ledger
    where user_id = p_user_id and delta > 0 and reason <> 'admin_adjust'
      and created_at >= public.app_day_start();
    v_grant := least(p_delta, greatest(coalesce(public.config_int('stars.daily_cap'), 0) - v_earned, 0));
  end if;

  if v_grant > 0 then
    insert into public.star_ledger (user_id, delta, reason, ref_id) values (p_user_id, v_grant, p_reason, p_ref);
    update public.profiles set stars = stars + v_grant where id = p_user_id;
  end if;
  return v_grant;
end;
$$;

-- 별조각 사용 (구매 등). 잔액이 모자라면 insufficient_stars.
create or replace function public.spend_stars(p_user_id uuid, p_amount int, p_reason text, p_ref text default null)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_balance int;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  select stars into v_balance from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'profile_not_found' using errcode = '42501';
  end if;
  if v_balance < p_amount then
    raise exception 'insufficient_stars' using errcode = '22023';
  end if;
  insert into public.star_ledger (user_id, delta, reason, ref_id) values (p_user_id, -p_amount, p_reason, p_ref);
  update public.profiles set stars = stars - p_amount where id = p_user_id returning stars into v_balance;
  return v_balance;
end;
$$;

-- 스트릭 (6.2) ----------------------------------------------------------------------
-- 빠진 날이 있으면 보호권으로 메우고, 모자라면 끊는다. daily_rollover와 세트 완료가 함께 쓴다.
create or replace function public.apply_streak_gap(p_user_id uuid)
returns text[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  v_today date := public.app_day();
  v_missed int;
begin
  select * into p from public.profiles where id = p_user_id for update;
  if p.streak_last is null or p.streak_last >= v_today - 1 then
    return '{}';
  end if;
  v_missed := (v_today - 1) - p.streak_last;
  if p.streak_count > 0 and p.streak_freezes >= v_missed then
    update public.profiles
      set streak_freezes = streak_freezes - v_missed, streak_last = v_today - 1
      where id = p_user_id;
    return array['streak.freeze_used'];
  end if;
  if p.streak_count > 0 then
    update public.profiles set streak_count = 0 where id = p_user_id;
    return array['streak.broken'];
  end if;
  return '{}';
end;
$$;

-- 오늘 복습 세트를 처음 끝냈을 때 +1. bonus_every일마다 별조각, freeze_every일마다 보호권.
create or replace function public.touch_streak(p_user_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_events text[];
  p public.profiles;
  v_today date := public.app_day();
  v_count int;
  v_stars int := 0;
begin
  v_events := public.apply_streak_gap(p_user_id);
  select * into p from public.profiles where id = p_user_id for update;
  if p.streak_last = v_today then
    return jsonb_build_object('events', to_jsonb(v_events), 'streak', p.streak_count, 'stars', 0);
  end if;

  v_count := case when p.streak_last = v_today - 1 then p.streak_count + 1 else 1 end;
  update public.profiles
    set streak_count = v_count,
        streak_last = v_today,
        streak_freezes = case
          when v_count % greatest(public.config_int('streak.freeze_every'), 1) = 0
            then least(streak_freezes + 1, public.config_int('streak.freeze_max'))
          else streak_freezes end
    where id = p_user_id;
  v_events := array_append(v_events, 'streak.up');

  if v_count % greatest(public.config_int('streak.bonus_every'), 1) = 0 then
    v_stars := public.grant_stars(p_user_id, public.config_int('stars.streak_7'), 'streak_bonus', v_count::text);
    v_events := array_append(v_events, 'streak.milestone');
  end if;
  return jsonb_build_object('events', to_jsonb(v_events), 'streak', v_count, 'stars', v_stars);
end;
$$;

-- 매일 04:00 KST: 끊긴 스트릭 정리와 보호권 사용. 친구 스트릭·펫 기분은 해당 단계에서 더한다.
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
  return n;
end;
$$;

-- 학습 이벤트 훅. 이후 기능(스터디 그룹 등)이 이 함수를 바꿔 끼워 진행도를 더한다.
create or replace function public.on_study_events(p_user_id uuid, p_events text[], p_ref text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return '{}'::jsonb;
end;
$$;

-- 답 보상 (6.1). 오답 교정은 정답 XP 대신 더 큰 교정 보상을 준다.
-- 정답 XP는 복습할 때가 된(또는 처음 보는) 카드에만 준다. 같은 단원을 반복해서 XP를 쌓지 못하게.
create or replace function public.apply_answer_rewards(
  p_user_id uuid, p_correct boolean, p_was_wrong boolean, p_was_over boolean, p_was_due boolean, p_ref text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_xp int := 0;
  v_stars int := 0;
  v_reason text;
  x jsonb := '{}'::jsonb;
begin
  if not p_correct then
    return jsonb_build_object('xp', 0, 'stars', 0, 'level_up', false);
  end if;

  if p_was_wrong and p_was_over then
    v_reason := 'overconfident_fixed';
  elsif p_was_wrong then
    v_reason := 'wrong_fixed';
  elsif p_was_due then
    v_reason := 'correct';
  end if;

  if v_reason is not null then
    v_xp := public.config_int('xp.' || v_reason);
    x := public.grant_xp(p_user_id, v_xp, v_reason, p_ref);
    if v_reason <> 'correct' then
      v_stars := public.grant_stars(p_user_id, public.config_int('stars.' || v_reason), v_reason, p_ref);
    end if;
  end if;

  return jsonb_build_object(
    'xp', v_xp,
    'stars', v_stars,
    'level_up', coalesce((x ->> 'level_up')::boolean, false),
    'level', x -> 'level'
  );
end;
$$;

-- submit_answer: 2단계 함수에 보상과 훅을 더한다 -------------------------------------------
create or replace function public.submit_answer(
  p_user_id uuid,
  p_session_id uuid,
  p_question_id uuid,
  p_picked jsonb,
  p_confidence text,
  p_duration_ms int,
  p_candidates jsonb,
  p_prev_reps int,
  p_essay jsonb default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_question public.questions;
  v_state public.card_states;
  v_session public.review_sessions;
  v_correct boolean;
  v_rating int;
  v_next jsonb;
  v_attempt bigint;
  v_events text[] := '{}';
  v_was_wrong boolean;
  v_was_over boolean;
  v_was_due boolean;
  v_answered int;
  v_rewards jsonb;
  v_hook jsonb;
begin
  if p_confidence not in ('sure', 'maybe', 'guess') then
    raise exception 'invalid_confidence' using errcode = '22023';
  end if;

  select q.* into v_question
  from public.questions q join public.decks d on d.id = q.deck_id
  where q.id = p_question_id and d.owner_id = p_user_id;
  if not found then
    raise exception 'question_not_found' using errcode = '42501';
  end if;

  if p_session_id is not null then
    select * into v_session from public.review_sessions
    where id = p_session_id and user_id = p_user_id
    for update;
    if not found or not (p_question_id = any (v_session.question_ids)) then
      raise exception 'not_in_session' using errcode = '42501';
    end if;
    if exists (select 1 from public.attempts where session_id = p_session_id and question_id = p_question_id) then
      raise exception 'already_answered' using errcode = '23505';
    end if;
  end if;

  select * into v_state from public.card_states
  where user_id = p_user_id and question_id = p_question_id
  for update;
  if found and coalesce((v_state.fsrs ->> 'reps')::int, 0) <> coalesce(p_prev_reps, 0) then
    raise exception 'stale_card' using errcode = '40001';
  end if;

  v_correct := public.grade_answer(v_question.type, v_question.answer, p_picked, p_essay);

  -- 5.3 결과 → FSRS 등급: 틀림 Again(1), 맞힘+모름 Hard(2), 맞힘+애매 Good(3), 맞힘+확실 Easy(4)
  v_rating := case
    when not v_correct then 1
    when p_confidence = 'guess' then 2
    when p_confidence = 'maybe' then 3
    else 4
  end;
  v_next := p_candidates -> v_rating::text;
  if v_next is null or v_next -> 'card' is null or v_next ->> 'due' is null then
    raise exception 'invalid_candidates' using errcode = '22023';
  end if;

  v_was_wrong := coalesce(v_state.in_wrong_note, false);
  v_was_over := coalesce(v_state.overconfident, false);
  v_was_due := v_state.question_id is null or v_state.due <= now();

  insert into public.card_states (user_id, question_id, fsrs, due, in_wrong_note, overconfident, last_wrong_at)
  values (
    p_user_id, p_question_id, v_next -> 'card', (v_next ->> 'due')::timestamptz,
    not v_correct, (not v_correct and p_confidence = 'sure'), case when not v_correct then now() end
  )
  on conflict (user_id, question_id) do update set
    fsrs = excluded.fsrs,
    due = excluded.due,
    in_wrong_note = not v_correct,
    overconfident = case when v_correct then false else (card_states.overconfident or p_confidence = 'sure') end,
    last_wrong_at = case when v_correct then card_states.last_wrong_at else now() end;

  insert into public.attempts (user_id, question_id, session_id, correct, confidence, picked, duration_ms)
  values (
    p_user_id, p_question_id, p_session_id, v_correct, p_confidence,
    case when p_essay is null then p_picked else jsonb_build_object('text', p_picked, 'grade', p_essay) end,
    greatest(0, least(coalesce(p_duration_ms, 0), 3600000))
  )
  returning id into v_attempt;

  if v_correct then
    v_events := array_append(v_events, 'review.correct');
    if v_was_wrong then
      v_events := array_append(v_events, case when v_was_over then 'wrong.overconfident_fixed' else 'wrong.fixed' end);
    end if;
  else
    v_events := array_append(v_events, 'review.wrong');
    if p_confidence = 'sure' then
      v_events := array_append(v_events, 'review.overconfident');
    end if;
  end if;

  v_rewards := public.apply_answer_rewards(p_user_id, v_correct, v_was_wrong, v_was_over, v_was_due, 'attempt:' || v_attempt);
  if (v_rewards ->> 'xp')::int > 0 then v_events := array_append(v_events, 'xp.gained'); end if;
  if (v_rewards ->> 'stars')::int > 0 then v_events := array_append(v_events, 'stars.gained'); end if;
  if (v_rewards ->> 'level_up')::boolean then v_events := array_append(v_events, 'level.up'); end if;

  if p_session_id is not null then
    select count(*) into v_answered from public.attempts where session_id = p_session_id;
    if v_answered >= cardinality(v_session.question_ids) then
      v_events := array_append(v_events, 'set.answered');
    end if;
  end if;

  v_hook := public.on_study_events(p_user_id, v_events, 'attempt:' || v_attempt);

  return jsonb_build_object(
    'attempt_id', v_attempt,
    'correct', v_correct,
    'rating', v_rating,
    'answer', v_question.answer,
    'explanation', v_question.explanation,
    'due', v_next ->> 'due',
    'in_wrong_note', not v_correct,
    'events', to_jsonb(v_events) || coalesce(v_hook -> 'events', '[]'::jsonb),
    'rewards', v_rewards,
    'group', v_hook -> 'groups'
  );
end;
$$;

-- complete_review_set: 세트 보상, 스트릭 갱신 -------------------------------------------
create or replace function public.complete_review_set(p_user_id uuid, p_session_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session public.review_sessions;
  v_total int;
  v_correct int;
  v_over int;
  v_stars int := 0;
  v_streak jsonb := '{}'::jsonb;
  v_events jsonb := '[]'::jsonb;
  v_hook jsonb;
begin
  select * into v_session from public.review_sessions
  where id = p_session_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'session_not_found' using errcode = '42501';
  end if;

  select count(*), count(*) filter (where correct), count(*) filter (where not correct and confidence = 'sure')
    into v_total, v_correct, v_over
  from public.attempts where session_id = p_session_id;

  if v_total < cardinality(v_session.question_ids) then
    raise exception 'set_not_finished' using errcode = '22023';
  end if;

  if v_session.completed_at is null then
    update public.review_sessions set completed_at = now() where id = p_session_id;
    v_stars := public.grant_stars(p_user_id, public.config_int('stars.review_set'), 'review_set', p_session_id::text);
    v_streak := public.touch_streak(p_user_id);
    v_events := '["set.complete"]'::jsonb || coalesce(v_streak -> 'events', '[]'::jsonb);
    if v_stars > 0 then v_events := v_events || '["stars.gained"]'::jsonb; end if;
    v_hook := public.on_study_events(p_user_id, array['set.complete'], 'session:' || p_session_id);
    v_events := v_events || coalesce(v_hook -> 'events', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'total', v_total,
    'correct', v_correct,
    'overconfident', v_over,
    'already_completed', v_session.completed_at is not null,
    'stars', v_stars + coalesce((v_streak ->> 'stars')::int, 0),
    'streak', (select streak_count from public.profiles where id = p_user_id),
    'events', v_events,
    'group', v_hook -> 'groups'
  );
end;
$$;

-- 시험 대비 세트 (5.3): 서버가 기억률 낮은 순으로 고른 카드로 세트를 만든다. 하루 한 번.
alter table public.review_sessions drop constraint review_sessions_kind_check;
alter table public.review_sessions add constraint review_sessions_kind_check
  check (kind in ('daily', 'deck', 'wrong', 'exam', 'rescue'));
alter table public.review_sessions add column exam_id uuid references public.exams on delete set null;

create or replace function public.create_custom_session(
  p_user_id uuid, p_kind text, p_question_ids uuid[], p_exam_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_session uuid;
  v_size int := coalesce(public.config_int('review.set_size'), 10);
begin
  if p_kind not in ('exam', 'rescue') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  if p_question_ids is null or cardinality(p_question_ids) = 0 or cardinality(p_question_ids) > v_size then
    raise exception 'invalid_questions' using errcode = '22023';
  end if;
  -- 전부 본인 단원의 문제여야 한다
  if (select count(*) from public.questions q join public.decks d on d.id = q.deck_id
      where q.id = any (p_question_ids) and d.owner_id = p_user_id) <> cardinality(p_question_ids) then
    raise exception 'question_not_found' using errcode = '42501';
  end if;
  if p_kind = 'exam' then
    if not exists (select 1 from public.exams where id = p_exam_id and user_id = p_user_id) then
      raise exception 'exam_not_found' using errcode = '42501';
    end if;
    if exists (select 1 from public.review_sessions where user_id = p_user_id and kind = 'exam'
               and created_at >= public.app_day_start()) then
      raise exception 'exam_set_used_today' using errcode = '22023';
    end if;
  end if;

  insert into public.review_sessions (user_id, kind, question_ids, exam_id)
  values (p_user_id, p_kind, p_question_ids, p_exam_id)
  returning id into v_session;
  return v_session;
end;
$$;

-- 권한: 지급·세트 함수는 service_role만 -------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.grant_xp(uuid, int, text, text)',
    'public.grant_stars(uuid, int, text, text, boolean)',
    'public.spend_stars(uuid, int, text, text)',
    'public.apply_streak_gap(uuid)',
    'public.touch_streak(uuid)',
    'public.daily_rollover()',
    'public.on_study_events(uuid, text[], text)',
    'public.apply_answer_rewards(uuid, boolean, boolean, boolean, boolean, text)',
    'public.create_custom_session(uuid, text, uuid[], uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;

-- 크론: 매일 04:00 KST(= 19:00 UTC) daily_rollover. pg_cron이 없는 환경(테스트 등)에서는 건너뛴다.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('daily_rollover', '0 19 * * *', 'select public.daily_rollover()');
  end if;
exception when others then
  raise notice 'pg_cron 설정을 건너뜁니다: %', sqlerrm;
end
$$;
