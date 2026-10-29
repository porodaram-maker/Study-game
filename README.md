# 픽셀공부방

고등학생용 하루 10분 복습 + 픽셀 아바타·펫 꾸미기 웹서비스. 명세는 [`docs/SPEC.md`](docs/SPEC.md), 작업 규칙은 [`CLAUDE.md`](CLAUDE.md).

## 시작하기

```bash
npm install
cp .env.example .env.local   # Supabase URL·anon key·service role key, ANTHROPIC_API_KEY 채우기
npm run dev
```

### Supabase 준비

1. Supabase 프로젝트를 만들고 `supabase/migrations/*.sql`을 파일 이름 순서대로 적용한다.
   - Supabase CLI: `supabase link` 후 `supabase db push`
   - 또는 SQL Editor에 순서대로 붙여넣기
2. (선택) `supabase/seed.sql` 실행.
3. Auth → URL Configuration에 `NEXT_PUBLIC_SITE_URL`과 `/auth/callback`을 리다이렉트 주소로 등록한다.
4. 최초 어드민은 SQL로 직접 지정한다 (SPEC 3장):
   ```sql
   update profiles set role = 'admin' where id = '<내 uid>';
   ```

## 테스트

```bash
npm test          # 단위 테스트 (라우팅 규칙, 역할, 입력 검증)
npm run test:db   # DB 테스트: 마이그레이션 + RLS. TEST_DATABASE_URL 필요
npm run typecheck
npm run lint
```

`test:db`는 `TEST_DATABASE_URL`의 Postgres에 임시 DB를 만들어 `supabase/tests/supabase-shim.sql`(auth 스키마와 역할 흉내) + 마이그레이션을 적용하고, 끝나면 지운다. 일반 Postgres 16이면 충분하다.

## 폴더

```text
app/(auth)        로그인, 가입, 온보딩
app/(student)     학생 화면 (하단 탭)
app/auth          이메일 인증 콜백, 로그아웃
app/api/ai        문제 생성(generate), 서술형 채점(grade)
components/ui     스티커 카드, 젤리 버튼 등 (SPEC 15장)
components/study  복습 세션, 확신도, 답 입력
lib/supabase      브라우저·서버 클라이언트, proxy용 세션 갱신
lib/auth          requireRole(), 라우팅 규칙, 입력 스키마
lib/ai            Claude 호출, 프롬프트, 생성 결과 검증, 속도·하루 한도
lib/srs           ts-fsrs 래퍼 (등급별 다음 상태, 기억 확률)
lib/study         문제 생성·답 제출 흐름, 단원 진행 바
lib/game          game_config 읽기 (1분 캐시)
proxy.ts          Next.js 16 proxy(구 middleware): 세션 갱신 + 화면 가드
supabase/         마이그레이션, 시드, 테스트용 shim
tests/            unit, db
```

## 채점과 복습 흐름

1. `/study/new`에서 자료를 붙여 넣으면 `/api/ai/generate`가 한도를 확인하고, 같은 자료(해시)가 있으면 재사용, 없으면 Claude로 문제를 만든다. 결과는 zod로 검사하고 실패하면 1회만 재시도한다.
2. 복습 세트는 `start_review_session`(SQL)이 만든다. 오답노트 카드 먼저, 나머지는 개념을 번갈아.
3. 답을 내면 서버가 ts-fsrs로 등급별 다음 상태 4개를 계산해 `submit_answer`(SQL, service_role 전용)에 넘기고, SQL이 채점한 뒤 맞는 등급의 상태를 저장한다. 서술형은 `/api/ai/grade`가 루브릭 AI 채점 후 같은 함수로 기록한다.
