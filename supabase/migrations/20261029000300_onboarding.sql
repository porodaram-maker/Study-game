-- 온보딩: 닉네임·학년으로 프로필을 만들고 친구 코드를 자동 생성한다 (SPEC 10장 /onboarding, 8.1).

-- 닉네임 금칙어 (12장). 어드민이 콘솔 게임 설정에서 바꾼다.
insert into public.game_config (key, value, description)
values (
  'nickname.banned_words',
  '["admin","운영자","관리자","어드민","시발","씨발","병신","존나","fuck","shit"]',
  '닉네임 금칙어 목록 (부분 일치, 대소문자 무시)'
)
on conflict (key) do nothing;

-- 헷갈리는 글자(0/O, 1/I/L)를 뺀 31자. 31^6 ≈ 8.9억 가지.
create or replace function public.generate_friend_code()
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
    exit when not exists (select 1 from public.profiles where friend_code = code);
  end loop;
  return code;
end;
$$;
revoke execute on function public.generate_friend_code() from public, anon, authenticated;

-- 서버와 같은 규칙: 2~12자, 한글·영문·숫자·밑줄, 금칙어 없음
create or replace function public.nickname_problem(p_nickname text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  banned jsonb;
  word text;
begin
  if p_nickname is null or char_length(p_nickname) not between 2 and 12 then
    return 'length';
  end if;
  if p_nickname !~ '^[가-힣a-zA-Z0-9_]+$' then
    return 'charset';
  end if;
  select value into banned from public.game_config where key = 'nickname.banned_words';
  for word in select jsonb_array_elements_text(coalesce(banned, '[]'::jsonb)) loop
    if position(lower(word) in lower(p_nickname)) > 0 then
      return 'banned';
    end if;
  end loop;
  return null;
end;
$$;

create or replace function public.create_profile(p_nickname text, p_grade smallint)
returns public.profiles
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  nickname text := btrim(p_nickname);
  problem text;
  age_ok boolean;
  created public.profiles;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- 만 14세 이상 확인은 가입 때 받은 메타데이터로 다시 확인한다 (12장)
  select coalesce((raw_user_meta_data ->> 'age_14_plus')::boolean, false)
    into age_ok from auth.users where id = uid;
  if not coalesce(age_ok, false) then
    raise exception 'age_not_confirmed' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles where id = uid) then
    raise exception 'profile_exists' using errcode = '23505';
  end if;

  problem := public.nickname_problem(nickname);
  if problem is not null then
    raise exception 'nickname_%', problem using errcode = '22023';
  end if;

  if p_grade is null or p_grade not between 1 and 3 then
    raise exception 'grade_invalid' using errcode = '22023';
  end if;

  begin
    insert into public.profiles (id, nickname, grade, friend_code)
    values (uid, nickname, p_grade, public.generate_friend_code())
    returning * into created;
  exception when unique_violation then
    raise exception 'nickname_taken' using errcode = '23505';
  end;

  return created;
end;
$$;
revoke execute on function public.create_profile(text, smallint) from public, anon;
grant execute on function public.create_profile(text, smallint) to authenticated;
