import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';

const ROOT = path.resolve(import.meta.dirname, '../..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase/migrations');
const SHIM = path.join(ROOT, 'supabase/tests/supabase-shim.sql');

export function adminUrl() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL 환경변수가 필요합니다 (.env.example 참고).');
  return url;
}

function withDatabase(url: string, db: string) {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

/** 임시 DB를 만들고 shim + 마이그레이션을 순서대로 적용한다. */
export async function createTestDatabase() {
  const name = `pixel_test_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const admin = new Client({ connectionString: adminUrl() });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const client = new Client({ connectionString: withDatabase(adminUrl(), name) });
  await client.connect();
  await client.query(readFileSync(SHIM, 'utf8'));
  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await client.query(readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
    } catch (error) {
      throw new Error(`마이그레이션 실패: ${file}\n${String(error)}`);
    }
  }

  async function drop() {
    await client.end();
    const a = new Client({ connectionString: adminUrl() });
    await a.connect();
    await a.query(`drop database if exists ${name} with (force)`);
    await a.end();
  }

  return { client, drop };
}

export type Db = Awaited<ReturnType<typeof createTestDatabase>>['client'];

/** auth.users에 사용자를 만든다 (가입 흉내). */
export async function createAuthUser(db: Db, opts: { age14?: boolean } = {}) {
  const id = randomUUID();
  await db.query('insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)', [
    id,
    `${id}@test.local`,
    { age_14_plus: opts.age14 ?? true },
  ]);
  return id;
}

/**
 * 로그인한 사용자(authenticated 역할 + JWT sub)로 fn을 실행한다.
 * 트랜잭션 하나로 실행하고 성공하면 커밋, 실패하면 롤백한다.
 */
export async function asUser<T>(db: Db, uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query('begin');
  try {
    if (uid) {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
      await db.query('set local role authenticated');
    } else {
      await db.query('set local role anon');
    }
    const result = await fn();
    await db.query('commit');
    return result;
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}

/** 서버(service_role)로 fn을 실행한다. Route Handler·서버 액션이 쓰는 경로. */
export async function asService<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  await db.query('begin');
  try {
    await db.query('set local role service_role');
    const result = await fn();
    await db.query('commit');
    return result;
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}
