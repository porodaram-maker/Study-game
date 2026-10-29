import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createAuthUser, createTestDatabase, type Db } from './harness';

let db: Db;
let drop: () => Promise<void>;
let alice: string;
let bob: string;

async function onboard(uid: string, nickname: string) {
  const { rows } = await asUser(db, uid, () =>
    db.query('select * from public.create_profile($1, $2::smallint)', [nickname, 2]),
  );
  return rows[0];
}

beforeAll(async () => {
  ({ client: db, drop } = await createTestDatabase());
  alice = await createAuthUser(db);
  bob = await createAuthUser(db);
  await onboard(alice, '앨리스');
  await onboard(bob, 'bob_02');
});

afterAll(async () => {
  await drop?.();
});

describe('온보딩 create_profile', () => {
  it('친구 코드 6자리를 자동으로 만든다', async () => {
    const { rows } = await asUser(db, alice, () => db.query('select friend_code, role, stars from public.profiles'));
    expect(rows).toHaveLength(1);
    expect(rows[0].friend_code).toMatch(/^[A-HJ-KM-NP-Z2-9]{6}$/);
    expect(rows[0].role).toBe('student');
    expect(rows[0].stars).toBe(0);
  });

  it('만 14세 확인이 없으면 거부한다', async () => {
    const kid = await createAuthUser(db, { age14: false });
    await expect(onboard(kid, '어린이')).rejects.toThrow(/age_not_confirmed/);
  });

  it('닉네임 규칙(길이, 문자, 금칙어, 중복)을 서버에서 검사한다', async () => {
    const u = await createAuthUser(db);
    await expect(onboard(u, 'a')).rejects.toThrow(/nickname_length/);
    await expect(onboard(u, '공 백')).rejects.toThrow(/nickname_charset/);
    await expect(onboard(u, '진짜운영자')).rejects.toThrow(/nickname_banned/);
    await expect(onboard(u, '앨리스')).rejects.toThrow(/nickname_taken/);
  });

  it('프로필은 한 번만 만든다', async () => {
    await expect(onboard(alice, '앨리스2')).rejects.toThrow(/profile_exists/);
  });

  it('비로그인은 프로필을 만들 수 없다', async () => {
    await expect(
      asUser(db, null, () => db.query("select public.create_profile('익명', 1::smallint)")),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('RLS: 다른 사용자 데이터 차단', () => {
  it('다른 사용자의 프로필은 보이지 않는다', async () => {
    const { rows } = await asUser(db, alice, () =>
      db.query('select id from public.profiles where id = $1', [bob]),
    );
    expect(rows).toHaveLength(0);
  });

  it('다른 사용자의 단원·문제는 읽을 수도 쓸 수도 없다', async () => {
    const deckId = await asUser(db, bob, async () => {
      const { rows } = await db.query(
        "insert into public.decks (owner_id, subject, title, mode) values ($1, '국어', '비밀 단원', 'naesin') returning id",
        [bob],
      );
      await db.query(
        `insert into public.questions (deck_id, concept, type, prompt, answer, explanation)
         values ($1, '개념', 'blank', '문제', '"답"', '해설')`,
        [rows[0].id],
      );
      return rows[0].id as string;
    });

    const seen = await asUser(db, alice, async () => ({
      decks: (await db.query('select id from public.decks where id = $1', [deckId])).rowCount,
      questions: (await db.query('select id from public.questions where deck_id = $1', [deckId])).rowCount,
      updated: (await db.query("update public.decks set title = '해킹' where id = $1", [deckId])).rowCount,
      deleted: (await db.query('delete from public.questions where deck_id = $1', [deckId])).rowCount,
    }));
    expect(seen).toEqual({ decks: 0, questions: 0, updated: 0, deleted: 0 });

    await expect(
      asUser(db, alice, () =>
        db.query(
          "insert into public.decks (owner_id, subject, title, mode) values ($1, '수학', '남의 이름으로', 'suneung')",
          [bob],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('비로그인은 아무 사용자 데이터도 읽지 못한다', async () => {
    await expect(asUser(db, null, () => db.query('select * from public.profiles'))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe('RLS: 클라이언트가 바꾸면 안 되는 값', () => {
  it('별조각·XP·역할·닉네임을 직접 update 할 수 없다', async () => {
    for (const column of ['stars = 9999', 'xp = 9999', "role = 'admin'", "nickname = '바꿈'", "friend_code = 'AAAAAA'"]) {
      await expect(
        asUser(db, alice, () => db.query(`update public.profiles set ${column} where id = $1`, [alice])),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it('설정·공개 범위·학년은 본인이 바꿀 수 있고 남의 것은 못 바꾼다', async () => {
    const mine = await asUser(db, alice, () =>
      db.query(`update public.profiles set grade = 3, settings = settings || '{"sound":false}' where id = $1`, [alice]),
    );
    expect(mine.rowCount).toBe(1);
    const others = await asUser(db, alice, () =>
      db.query('update public.profiles set grade = 1 where id = $1', [bob]),
    );
    expect(others.rowCount).toBe(0);
  });

  it('원장과 감사 로그는 학생이 쓸 수 없다', async () => {
    await expect(
      asUser(db, alice, () =>
        db.query("insert into public.star_ledger (user_id, delta, reason) values ($1, 100, 'cheat')", [alice]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      asUser(db, alice, () =>
        db.query("insert into public.audit_logs (actor_id, action) values ($1, 'item.create')", [alice]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('역할 헬퍼 is_editor / is_admin', () => {
  it('학생은 둘 다 false, 승격하면 true', async () => {
    const check = () =>
      asUser(db, bob, async () => (await db.query('select public.is_editor() e, public.is_admin() a')).rows[0]);
    expect(await check()).toEqual({ e: false, a: false });

    await db.query("update public.profiles set role = 'editor' where id = $1", [bob]);
    expect(await check()).toEqual({ e: true, a: false });

    await db.query("update public.profiles set role = 'admin' where id = $1", [bob]);
    expect(await check()).toEqual({ e: true, a: true });
  });

  it('감사 로그는 수정·삭제할 수 없고, 에디터는 본인 기록만 본다', async () => {
    await db.query("update public.profiles set role = 'editor' where id = $1", [alice]);
    await asUser(db, alice, () =>
      db.query("insert into public.audit_logs (actor_id, action) values ($1, 'item.create')", [alice]),
    );
    await asUser(db, bob, () =>
      db.query("insert into public.audit_logs (actor_id, action) values ($1, 'config.update')", [bob]),
    );

    const editorSees = await asUser(db, alice, () => db.query('select actor_id from public.audit_logs'));
    expect(editorSees.rows.map((r) => r.actor_id)).toEqual([alice]);
    const adminSees = await asUser(db, bob, () => db.query('select actor_id from public.audit_logs'));
    expect(adminSees.rowCount).toBe(2);

    await expect(
      asUser(db, bob, () => db.query("update public.audit_logs set action = 'x'")),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(db, bob, () => db.query('delete from public.audit_logs'))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe('아이템 공개 범위', () => {
  it('학생은 게시되고 시즌 기간 안인 아이템만 본다', async () => {
    const student = await createAuthUser(db);
    await onboard(student, '학생셋');
    await db.query("insert into public.item_slots (key, label, z_index, category) values ('hat', '모자', 90, 'avatar')");
    await db.query(`
      insert into public.seasons (id, name, starts_at, ends_at, status) values
        ('00000000-0000-0000-0000-0000000000a1', '지난 시즌', now() - interval '30 days', now() - interval '1 day', 'published'),
        ('00000000-0000-0000-0000-0000000000a2', '이번 시즌', now() - interval '1 day', now() + interval '30 days', 'published');
      insert into public.items (name, slot_key, status, season_id, publish_at) values
        ('초안 모자', 'hat', 'draft', null, null),
        ('게시 모자', 'hat', 'published', null, null),
        ('예약 모자', 'hat', 'published', null, now() + interval '1 day'),
        ('지난 시즌 모자', 'hat', 'published', '00000000-0000-0000-0000-0000000000a1', null),
        ('이번 시즌 모자', 'hat', 'published', '00000000-0000-0000-0000-0000000000a2', null);
    `);
    const { rows } = await asUser(db, student, () => db.query('select name from public.items order by name'));
    expect(rows.map((r) => r.name)).toEqual(['게시 모자', '이번 시즌 모자']);

    const editor = await asUser(db, alice, () => db.query('select count(*)::int n from public.items'));
    expect(editor.rows[0].n).toBe(5);
  });
});
