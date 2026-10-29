# 픽셀공부방

고등학생용 하루 10분 복습 + 픽셀 아바타·펫 꾸미기 웹서비스. 명세는 [`docs/SPEC.md`](docs/SPEC.md), 작업 규칙은 [`CLAUDE.md`](CLAUDE.md).

## 시작하기

```bash
npm install
cp .env.example .env.local   # Supabase URL, anon key 채우기
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
components/ui     스티커 카드, 젤리 버튼 등 (SPEC 15장)
lib/supabase      브라우저·서버 클라이언트, proxy용 세션 갱신
lib/auth          requireRole(), 라우팅 규칙, 입력 스키마
proxy.ts          Next.js 16 proxy(구 middleware): 세션 갱신 + 화면 가드
supabase/         마이그레이션, 시드, 테스트용 shim
tests/            unit, db
```
