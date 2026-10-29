import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { candidatesFor, newCard } from '@/lib/srs/fsrs';
import { asService, asUser, createAuthUser, createTestDatabase, type Db } from './harness';

let db: Db;
let drop: () => Promise<void>;

async function newStudent(nickname: string) {
  const uid = await createAuthUser(db);
  await asUser(db, uid, () => db.query('select public.create_profile($1, 2::smallint)', [nickname]));
  return uid;
}

async function profile(uid: string) {
  return (await db.query('select xp, stars, streak_count, streak_last, streak_freezes from public.profiles where id = $1', [uid])).rows[0];
}

async function setConfig(key: string, value: unknown) {
  await db.query('update public.game_config set value = $2 where key = $1', [key, JSON.stringify(value)]);
}

const svc = <T>(sql: string, params: unknown[]) => asService(db, async () => (await db.query(sql, params)).rows[0] as T);

beforeAll(async () => {
  ({ client: db, drop } = await createTestDatabase());
});
afterAll(async () => {
  await drop?.();
});

describe('설정값 seed (6.1)', () => {
  it('6.1의 키가 모두 있다', async () => {
    const { rows } = await db.query('select key from public.game_config');
    const keys = rows.map((r) => r.key);
    for (const k of ['xp.correct', 'xp.wrong_fixed', 'xp.overconfident_fixed', 'xp.explain_done', 'stars.review_set', 'stars.wrong_fixed',
      'stars.overconfident_fixed', 'stars.explain_done', 'stars.streak_7', 'stars.room_session', 'stars.cheer_received', 'stars.daily_cap',
      'streak.day_reset_hour', 'streak.freeze_every', 'streak.freeze_max', 'level.base', 'level.step', 'league.size', 'league.promote',
      'league.demote', 'notify.quiet_hours', 'ai_daily_generate_limit', 'srs_retention', 'anim_triggers']) {
      expect(keys).toContain(k);
    }
  });
});

describe('별조각 원장과 일일 상한', () => {
  it('상한을 넘겨 지급하지 않고, 원장 합계 = 잔액', async () => {
    const u = await newStudent('상한테스트');
    const grants: number[] = [];
    for (let i = 0; i < 15; i++) {
      grants.push((await svc<{ g: number }>(`select public.grant_stars($1, 5, 'test') g`, [u])).g);
    }
    expect(grants.reduce((a, b) => a + b, 0)).toBe(60);
    expect(grants.at(-1)).toBe(0);
    const p = await profile(u);
    const { rows } = await db.query('select coalesce(sum(delta),0)::int s from public.star_ledger where user_id = $1', [u]);
    expect(p.stars).toBe(60);
    expect(rows[0].s).toBe(60);
  });

  it('상한 설정을 DB에서 바꾸면 바로 적용된다', async () => {
    const u = await newStudent('설정변경');
    await setConfig('stars.daily_cap', 7);
    expect((await svc<{ g: number }>(`select public.grant_stars($1, 5, 'test') g`, [u])).g).toBe(5);
    expect((await svc<{ g: number }>(`select public.grant_stars($1, 5, 'test') g`, [u])).g).toBe(2);
    await setConfig('stars.daily_cap', 60);
    expect((await svc<{ g: number }>(`select public.grant_stars($1, 5, 'test') g`, [u])).g).toBe(5);
  });

  it('어드민 조정은 상한에 세지 않고, 잔액보다 많이 쓸 수 없다', async () => {
    const u = await newStudent('사용테스트');
    await svc(`select public.grant_stars($1, 100, 'admin_adjust', null, false)`, [u]);
    expect((await svc<{ g: number }>(`select public.grant_stars($1, 10, 'test') g`, [u])).g).toBe(10);
    expect((await svc<{ b: number }>(`select public.spend_stars($1, 30, 'purchase') b`, [u])).b).toBe(80);
    await expect(svc(`select public.spend_stars($1, 999, 'purchase')`, [u])).rejects.toThrow(/insufficient_stars/);
  });

  it('학생은 지급 함수를 부를 수 없다', async () => {
    const u = await newStudent('치트시도');
    for (const sql of [`select public.grant_stars($1, 999, 'cheat')`, `select public.grant_xp($1, 999, 'cheat')`, `select public.touch_streak($1)`]) {
      await expect(asUser(db, u, () => db.query(sql, [u]))).rejects.toThrow(/permission denied/);
    }
  });
});

describe('레벨', () => {
  it('n→n+1 필요 XP = base + (n-1)×step, 레벨업 이벤트', async () => {
    const lv = async (xp: number) => (await db.query('select public.level_for_xp($1) l', [xp])).rows[0].l;
    expect(await lv(0)).toBe(1);
    expect(await lv(99)).toBe(1);
    expect(await lv(100)).toBe(2);
    expect(await lv(249)).toBe(2);
    expect(await lv(250)).toBe(3);
    const u = await newStudent('레벨업');
    const r = await svc<{ r: { level_up: boolean; level: number } }>(`select public.grant_xp($1, 120, 'test') r`, [u]);
    expect(r.r).toMatchObject({ level_up: true, level: 2 });
  });
});

describe('스트릭과 보호권', () => {
  async function setStreak(u: string, count: number, daysAgo: number, freezes: number) {
    await db.query(
      `update public.profiles set streak_count = $2, streak_last = public.app_day() - $3::int, streak_freezes = $4 where id = $1`,
      [u, count, daysAgo, freezes],
    );
  }
  const touch = (u: string) => svc<{ r: { events: string[]; streak: number; stars: number } }>('select public.touch_streak($1) r', [u]);

  it('어제 이어서 하면 +1, 같은 날 두 번은 그대로', async () => {
    const u = await newStudent('스트릭1');
    await setStreak(u, 3, 1, 0);
    expect((await touch(u)).r.streak).toBe(4);
    expect((await touch(u)).r.streak).toBe(4);
  });

  it('하루 빠지면 보호권을 쓰고 이어진다, 없으면 1부터', async () => {
    const a = await newStudent('보호권있음');
    await setStreak(a, 5, 2, 1);
    const ra = await touch(a);
    expect(ra.r.events).toContain('streak.freeze_used');
    expect(ra.r.streak).toBe(6);
    expect((await profile(a)).streak_freezes).toBe(0);

    const b = await newStudent('보호권없음');
    await setStreak(b, 5, 2, 0);
    const rb = await touch(b);
    expect(rb.r.events).toContain('streak.broken');
    expect(rb.r.streak).toBe(1);
  });

  it('7일째에 별조각 보너스와 보호권(최대 2개)', async () => {
    const u = await newStudent('일주일');
    await setStreak(u, 6, 1, 2);
    const r = await touch(u);
    expect(r.r.events).toContain('streak.milestone');
    expect(r.r.stars).toBe(20);
    expect((await profile(u)).streak_freezes).toBe(2);
  });

  it('daily_rollover가 끊긴 스트릭을 정리한다', async () => {
    const u = await newStudent('롤오버');
    await setStreak(u, 4, 3, 0);
    await svc('select public.daily_rollover()', []);
    expect((await profile(u)).streak_count).toBe(0);
  });
});

describe('답·세트 보상 연결', () => {
  it('정답 XP, 오답 교정 보상, 세트 완료 별조각과 스트릭이 원장에 남는다', async () => {
    const u = await newStudent('보상연결');
    const qs = Array.from({ length: 3 }, (_, i) => ({ concept: 'c', type: 'mcq', prompt: `q${i}`, options: ['a', 'b', 'c', 'd'], answer: 0, explanation: 'e' }));
    await svc(`select public.create_generated_deck($1, '과학', 't', 'naesin', 'x', 'h', $2, $3)`, [u, JSON.stringify(qs), JSON.stringify(newCard(new Date()))]);
    const sid = (await asUser(db, u, () => db.query(`select public.start_review_session('daily') id`))).rows[0].id;
    const ids: string[] = (await db.query('select question_ids from public.review_sessions where id = $1', [sid])).rows[0].question_ids;

    const answer = async (qid: string, picked: number, conf: string, session: string | null = sid) => {
      const st = (await db.query('select fsrs from public.card_states where user_id = $1 and question_id = $2', [u, qid])).rows[0]?.fsrs ?? null;
      return (
        await svc<{ r: { correct: boolean; events: string[]; rewards: { xp: number; stars: number } } }>(
          'select public.submit_answer($1,$2,$3,$4,$5,0,$6,$7) r',
          [u, session, qid, JSON.stringify(picked), conf, JSON.stringify(candidatesFor(st, new Date(), 0.9)), st?.reps ?? 0],
        )
      ).r;
    };

    const first = await answer(ids[0]!, 0, 'maybe');
    expect(first.rewards).toMatchObject({ xp: 10, stars: 0 });
    expect(first.events).toContain('xp.gained');
    const wrong = await answer(ids[1]!, 1, 'sure');
    expect(wrong.rewards).toMatchObject({ xp: 0, stars: 0 });
    await answer(ids[2]!, 0, 'guess');

    const done = await svc<{ r: { stars: number; streak: number; events: string[] } }>('select public.complete_review_set($1, $2) r', [u, sid]);
    expect(done.r.stars).toBe(5);
    expect(done.r.streak).toBe(1);
    expect(done.r.events).toEqual(expect.arrayContaining(['set.complete', 'streak.up', 'stars.gained']));
    // 두 번 완료해도 보상은 한 번
    expect((await svc<{ r: { stars: number } }>('select public.complete_review_set($1, $2) r', [u, sid])).r.stars).toBe(0);

    // 확실했는데 틀린 문제 교정: 30 XP + 5 별조각
    const fix = await answer(ids[1]!, 0, 'maybe', null);
    expect(fix.rewards).toMatchObject({ xp: 30, stars: 5 });

    // 아직 복습할 때가 아닌 카드를 다시 맞혀도 XP는 없다
    const again = await answer(ids[0]!, 0, 'maybe', null);
    expect(again.correct).toBe(true);
    expect(again.rewards.xp).toBe(0);

    const p = await profile(u);
    expect(p.xp).toBe(10 + 10 + 30);
    expect(p.stars).toBe(5 + 5);
    const { rows } = await db.query('select reason, delta from public.star_ledger where user_id = $1 order by id', [u]);
    expect(rows).toEqual([{ reason: 'review_set', delta: 5 }, { reason: 'overconfident_fixed', delta: 5 }]);
  });

  it('XP 설정을 바꾸면 다음 정답부터 바로 반영된다', async () => {
    await setConfig('xp.correct', 25);
    const r = await svc<{ r: { xp: number } }>('select public.apply_answer_rewards($1, true, false, false, true, null) r', [await newStudent('설정반영')]);
    expect(r.r.xp).toBe(25);
    await setConfig('xp.correct', 10);
  });
});
