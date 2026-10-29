-- 2단계 학습 핵심: 문제 생성 저장, 복습 세트, 채점(submit_answer), 오답노트.
-- 채점과 FSRS 상태 저장은 서버(service_role)만 부른다. 클라이언트는 "풀었다"는 사실만 보낸다 (6.2).

-- 이 단계에서 쓰는 설정값. 나머지 6.1 값은 3단계에서 채운다.
insert into public.game_config (key, value, description) values
  ('ai_daily_generate_limit', '3', '무료 하루 문제 생성 횟수'),
  ('srs_retention', '0.9', 'FSRS 목표 기억률'),
  ('streak.day_reset_hour', '4', '하루 경계 시각 (KST)'),
  ('review.set_size', '10', '복습 한 세트 문제 수'),
  ('ai.rate_limit_per_minute', '3', 'AI 엔드포인트 사용자별 분당 호출 수'),
  ('ai.max_input_tokens', '15000', '문제 생성 입력 자료 최대 토큰'),
  ('essay.pass_score', '0.6', '서술형 정답 처리 기준 (루브릭 점수 비율)')
on conflict (key) do nothing;

create or replace function public.config_value(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select value from public.game_config where key = p_key;
$$;

-- 앱의 "오늘" 시작 시각: KST 새벽 4시(streak.day_reset_hour) 기준
create or replace function public.app_day_start(p_now timestamptz default now())
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  with h as (select coalesce((public.config_value('streak.day_reset_hour'))::int, 4) as hour)
  select (date_trunc('day', (p_now at time zone 'Asia/Seoul') - make_interval(hours => h.hour))
          + make_interval(hours => h.hour)) at time zone 'Asia/Seoul'
  from h;
$$;

-- 복습 세트 ---------------------------------------------------------------------
create table public.review_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  kind text not null check (kind in ('daily', 'deck', 'wrong')),
  deck_id uuid references public.decks on delete set null,
  question_ids uuid[] not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index review_sessions_user_created_idx on public.review_sessions (user_id, created_at desc);

alter table public.review_sessions enable row level security;
create policy review_sessions_select_own on public.review_sessions
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.review_sessions from authenticated;

alter table public.attempts
  add column session_id uuid references public.review_sessions on delete set null,
  add constraint attempts_mistake_type_check
    check (mistake_type is null or mistake_type in ('concept', 'calc', 'misread'));
create unique index attempts_session_question_idx on public.attempts (session_id, question_id)
  where session_id is not null;

alter table public.card_states add column last_wrong_at timestamptz;
create index card_states_wrong_idx on public.card_states (user_id, overconfident desc, last_wrong_at desc)
  where in_wrong_note;

-- 채점 (5.2) ----------------------------------------------------------------------
create or replace function public.normalize_answer(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(lower(coalesce(p, '')), '[[:space:][:punct:]·]', '', 'g');
$$;

-- 객관식·빈칸·OX+이유는 여기서 채점한다. 서술형은 서버가 AI 채점 결과(p_essay)를 넘긴다.
create or replace function public.grade_answer(
  p_type text, p_answer jsonb, p_picked jsonb, p_essay jsonb default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  accepted jsonb;
begin
  case p_type
    when 'mcq' then
      return jsonb_typeof(p_picked) = 'number' and p_picked = p_answer;
    when 'blank' then
      if jsonb_typeof(p_picked) <> 'string' then return false; end if;
      accepted := case when jsonb_typeof(p_answer) = 'array' then p_answer else jsonb_build_array(p_answer) end;
      return exists (
        select 1 from jsonb_array_elements_text(accepted) a
        where public.normalize_answer(a) = public.normalize_answer(p_picked #>> '{}')
          and public.normalize_answer(a) <> ''
      );
    when 'ox_reason' then
      return p_picked ->> 'ox' = p_answer ->> 'ox'
        and (p_picked -> 'reason') = (p_answer -> 'reason');
    when 'essay' then
      if p_essay is null or jsonb_typeof(p_essay -> 'score') <> 'number' then
        raise exception 'essay_grade_required' using errcode = '22023';
      end if;
      return (p_essay ->> 'score')::numeric >= coalesce((public.config_value('essay.pass_score'))::numeric, 0.6);
    else
      raise exception 'unsupported_question_type' using errcode = '22023';
  end case;
end;
$$;

-- 문제 생성 저장 (5.1) --------------------------------------------------------------
-- p_questions: [{concept,type,prompt,options,answer,rubric,explanation,difficulty}]
create or replace function public.create_generated_deck(
  p_user_id uuid,
  p_subject text,
  p_title text,
  p_mode text,
  p_text text,
  p_content_hash text,
  p_questions jsonb,
  p_new_card jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deck uuid;
  q jsonb;
  v_question uuid;
begin
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) = 0 then
    raise exception 'no_questions' using errcode = '22023';
  end if;

  insert into public.decks (owner_id, subject, title, mode)
  values (p_user_id, p_subject, p_title, p_mode)
  returning id into v_deck;

  insert into public.materials (deck_id, extracted_text, content_hash)
  values (v_deck, p_text, p_content_hash);

  for q in select * from jsonb_array_elements(p_questions) loop
    insert into public.questions (deck_id, concept, type, prompt, options, answer, rubric, explanation, difficulty)
    values (
      v_deck, q ->> 'concept', q ->> 'type', q ->> 'prompt',
      nullif(q -> 'options', 'null'::jsonb), q -> 'answer', nullif(q -> 'rubric', 'null'::jsonb),
      q ->> 'explanation', coalesce((q ->> 'difficulty')::smallint, 2)
    )
    returning id into v_question;

    -- 새 카드는 바로 오늘의 복습에 들어간다
    insert into public.card_states (user_id, question_id, fsrs, due)
    values (p_user_id, v_question, p_new_card, (p_new_card ->> 'due')::timestamptz);
  end loop;

  return v_deck;
end;
$$;

-- 복습 세트 만들기 (5.3, 5.4) ---------------------------------------------------------
-- daily: due <= now, 오답노트 먼저, 나머지는 개념을 번갈아(교차 학습). 오늘 끝내지 않은 세트가 있으면 이어서.
-- deck: 그 단원에서 복습할 때가 된 카드 먼저. wrong: 오답노트 (확실했는데 틀림 → 최근 틀림).
create or replace function public.start_review_session(p_kind text, p_deck_id uuid default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_size int := coalesce((public.config_value('review.set_size'))::int, 10);
  v_ids uuid[];
  v_session uuid;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_kind = 'daily' then
    select s.id into v_session
    from public.review_sessions s
    where s.user_id = uid and s.kind = 'daily' and s.completed_at is null
      and s.created_at >= public.app_day_start()
    order by s.created_at desc
    limit 1;
    if v_session is not null then
      return v_session;
    end if;

    -- rn: 같은 단원·개념 안에서의 순번. rn 순으로 정렬하면 개념이 번갈아 나온다.
    select array_agg(question_id order by wrong desc, over desc, last_wrong desc nulls last, rn, tiebreak)
      into v_ids
    from (
      select c.question_id,
             c.in_wrong_note as wrong,
             c.overconfident as over,
             c.last_wrong_at as last_wrong,
             row_number() over (partition by q.deck_id, q.concept order by c.due, random()) as rn,
             random() as tiebreak
      from public.card_states c
      join public.questions q on q.id = c.question_id
      where c.user_id = uid and c.due <= now()
    ) picked;
    v_ids := v_ids[1:v_size];

  elsif p_kind = 'deck' then
    if not exists (select 1 from public.decks where id = p_deck_id and owner_id = uid) then
      raise exception 'deck_not_found' using errcode = '42501';
    end if;
    select array_agg(question_id) into v_ids from (
      select c.question_id
      from public.card_states c
      join public.questions q on q.id = c.question_id
      where c.user_id = uid and q.deck_id = p_deck_id
      order by (c.due <= now()) desc, c.due
      limit v_size
    ) picked;

  elsif p_kind = 'wrong' then
    select array_agg(question_id) into v_ids from (
      select c.question_id
      from public.card_states c
      where c.user_id = uid and c.in_wrong_note
      order by c.overconfident desc, c.last_wrong_at desc nulls last
      limit v_size
    ) picked;

  else
    raise exception 'invalid_kind' using errcode = '22023';
  end if;

  if v_ids is null or cardinality(v_ids) = 0 then
    return null;
  end if;

  insert into public.review_sessions (user_id, kind, deck_id, question_ids)
  values (uid, p_kind, case when p_kind = 'deck' then p_deck_id end, v_ids)
  returning id into v_session;
  return v_session;
end;
$$;
revoke execute on function public.start_review_session(text, uuid) from public, anon;
grant execute on function public.start_review_session(text, uuid) to authenticated;

-- 답 제출 (11.1 submit_answer) -----------------------------------------------------------
-- p_candidates: 서버가 ts-fsrs로 계산한 등급별 다음 상태 {"1":{card,due},...,"4":{...}}
-- p_prev_reps: 계산에 쓴 카드의 reps (그 사이 다른 제출이 있었으면 stale_card)
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
  v_answered int;
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

  insert into public.card_states (user_id, question_id, fsrs, due, in_wrong_note, overconfident, last_wrong_at)
  values (
    p_user_id, p_question_id, v_next -> 'card', (v_next ->> 'due')::timestamptz,
    not v_correct, (not v_correct and p_confidence = 'sure'), case when not v_correct then now() end
  )
  on conflict (user_id, question_id) do update set
    fsrs = excluded.fsrs,
    due = excluded.due,
    -- 5.4 틀리면 오답노트, 확실했는데 틀리면 overconfident. 다시 맞히면 오답노트에서 빠진다.
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

  -- 애니메이션·보상용 이벤트 (11.1). 보상 지급은 3단계에서 이 이벤트에 붙는다.
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

  if p_session_id is not null then
    select count(*) into v_answered from public.attempts where session_id = p_session_id;
    if v_answered >= cardinality(v_session.question_ids) then
      v_events := array_append(v_events, 'set.answered');
    end if;
  end if;

  return jsonb_build_object(
    'attempt_id', v_attempt,
    'correct', v_correct,
    'rating', v_rating,
    'answer', v_question.answer,
    'explanation', v_question.explanation,
    'due', v_next ->> 'due',
    'in_wrong_note', not v_correct,
    'events', to_jsonb(v_events)
  );
end;
$$;

-- 세트 완료 (11.1 complete_review_set). 보상·스트릭은 3단계에서 붙인다.
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
  v_already boolean;
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

  v_already := v_session.completed_at is not null;
  if not v_already then
    update public.review_sessions set completed_at = now() where id = p_session_id;
  end if;

  return jsonb_build_object(
    'total', v_total,
    'correct', v_correct,
    'overconfident', v_over,
    'already_completed', v_already,
    'events', case when v_already then '[]'::jsonb else '["set.complete"]'::jsonb end
  );
end;
$$;

-- 서버 전용 함수는 service_role만 부른다
revoke execute on function public.create_generated_deck(uuid, text, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.submit_answer(uuid, uuid, uuid, jsonb, text, int, jsonb, int, jsonb) from public, anon, authenticated;
revoke execute on function public.complete_review_set(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_generated_deck(uuid, text, text, text, text, text, jsonb, jsonb) to service_role;
grant execute on function public.submit_answer(uuid, uuid, uuid, jsonb, text, int, jsonb, int, jsonb) to service_role;
grant execute on function public.complete_review_set(uuid, uuid) to service_role;
