import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { candidatesFor, newCard } from '@/lib/srs/fsrs';
import { asService, asUser, createAuthUser, createTestDatabase, type Db } from './harness';

let db: Db;
let drop: () => Promise<void>;
let a: string;
let b: string;
let outsider: string;
let groupId: string;
let deckA: string;

const as = <T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []) =>
  asUser(db, uid, async () => (await db.query(sql, params)).rows as T[]);
const svc = <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  asService(db, async () => (await db.query(sql, params)).rows as T[]);

async function student(nickname: string) {
  const uid = await createAuthUser(db);
  await as(uid, 'select public.create_profile($1, 2::smallint)', [nickname]);
  return uid;
}

async function makeDeck(uid: string, n = 3) {
  const qs = Array.from({ length: n }, (_, i) => ({ concept: `개념${i}`, type: 'mcq', prompt: `q${i}`, options: ['a', 'b', 'c', 'd'], answer: 0, explanation: 'e' }));
  const [r] = await svc<{ id: string }>(`select public.create_generated_deck($1, '과학', '광합성', 'naesin', '원문 필기 내용', 'h', $2, $3) id`, [
    uid,
    JSON.stringify(qs),
    JSON.stringify(newCard(new Date())),
  ]);
  return r!.id;
}

async function answer(uid: string, qid: string, picked: number, conf = 'maybe', session: string | null = null) {
  const st = (await db.query('select fsrs from public.card_states where user_id = $1 and question_id = $2', [uid, qid])).rows[0]?.fsrs ?? null;
  const [r] = await svc<{ r: { correct: boolean; events: string[] } }>('select public.submit_answer($1,$2,$3,$4,$5,0,$6,$7) r', [
    uid,
    session,
    qid,
    JSON.stringify(picked),
    conf,
    JSON.stringify(candidatesFor(st, new Date(), 0.9)),
    st?.reps ?? 0,
  ]);
  return r!.r;
}

beforeAll(async () => {
  ({ client: db, drop } = await createTestDatabase());
  a = await student('그룹장');
  b = await student('그룹원');
  outsider = await student('바깥사람');
});
afterAll(async () => {
  await drop?.();
});

describe('그룹 만들기·참가', () => {
  it('초대 코드로 참가하고, 그룹원만 그룹을 본다', async () => {
    const [g] = await as<{ id: string }>(a, `select public.create_group('과학 스터디') id`);
    groupId = g!.id;
    const [{ invite_code }] = (await db.query('select invite_code from public.study_groups where id = $1', [groupId])).rows;
    await as(b, 'select public.join_group($1)', [String(invite_code).toLowerCase()]);

    const members = await as<{ nickname: string; role: string }>(b, 'select nickname, role from public.group_member_list($1)', [groupId]);
    expect(members).toEqual([{ nickname: '그룹장', role: 'owner' }, expect.objectContaining({ nickname: '그룹원', role: 'member' })]);
    expect(await as(outsider, 'select * from public.group_member_list($1)', [groupId])).toHaveLength(0);
    expect(await as(outsider, 'select id from public.study_groups where id = $1', [groupId])).toHaveLength(0);
    await expect(as(outsider, 'select public.join_group($1)', ['ZZZZZZ'])).rejects.toThrow(/group_not_found/);
  });

  it('소셜 정지된 사용자는 참가할 수 없다', async () => {
    const banned = await student('정지됨');
    await db.query(`update public.profiles set social_banned_until = now() + interval '1 day' where id = $1`, [banned]);
    const [{ invite_code }] = (await db.query('select invite_code from public.study_groups where id = $1', [groupId])).rows;
    await expect(as(banned, 'select public.join_group($1)', [invite_code])).rejects.toThrow(/social_banned/);
  });
});

describe('단원 공유와 원문 공개', () => {
  it('원문 공개는 권리 확인이 있어야 하고, 켜야만 그룹원이 원문을 본다', async () => {
    deckA = await makeDeck(a);
    await expect(as(a, 'select public.share_deck($1, $2, true, true, false)', [groupId, deckA])).rejects.toThrow(/rights_not_confirmed/);

    const [s] = await as<{ id: string }>(a, 'select public.share_deck($1, $2, false, true, false) id', [groupId, deckA]);
    expect(await as(b, 'select id from public.questions where deck_id = $1', [deckA])).toHaveLength(3);
    expect(await as(b, 'select id from public.materials where deck_id = $1', [deckA])).toHaveLength(0);
    expect(await as(outsider, 'select id from public.questions where deck_id = $1', [deckA])).toHaveLength(0);

    await as(a, 'select public.share_deck($1, $2, true, true, true)', [groupId, deckA]);
    const mats = await as<{ extracted_text: string }>(b, 'select extracted_text from public.materials where deck_id = $1', [deckA]);
    expect(mats[0]!.extracted_text).toBe('원문 필기 내용');
    const [share] = (await db.query('select rights_confirmed_at from public.deck_shares where id = $1', [s!.id])).rows;
    expect(share.rights_confirmed_at).not.toBeNull();
    // 공유받은 사람은 남의 단원을 고치거나 지울 수 없다
    const del = await asUser(db, b, () => db.query('delete from public.questions where deck_id = $1', [deckA]));
    expect(del.rowCount).toBe(0);
  });

  it('남의 단원·가져온 단원은 공유할 수 없고, 바깥사람은 공유할 수 없다', async () => {
    await expect(as(b, 'select public.share_deck($1, $2, false, true, false)', [groupId, deckA])).rejects.toThrow(/deck_not_found/);
    const own = await makeDeck(outsider);
    await expect(as(outsider, 'select public.share_deck($1, $2, false, true, false)', [groupId, own])).rejects.toThrow(/not_member/);
  });

  it('가져오기: 복사본은 내 단원이 되고 원본 문제를 기억한다, 두 번 가져와도 하나', async () => {
    const [share] = (await db.query('select id from public.deck_shares where deck_id = $1', [deckA])).rows;
    const card = JSON.stringify(newCard(new Date()));
    const [r1] = await svc<{ id: string }>('select public.import_shared_deck($1, $2, $3) id', [b, share.id, card]);
    const [r2] = await svc<{ id: string }>('select public.import_shared_deck($1, $2, $3) id', [b, share.id, card]);
    expect(r1!.id).toBe(r2!.id);
    const copies = await as<{ origin_question_id: string }>(b, 'select origin_question_id from public.questions where deck_id = $1', [r1!.id]);
    expect(copies).toHaveLength(3);
    expect(copies.every((q) => q.origin_question_id)).toBe(true);
    await expect(svc('select public.import_shared_deck($1, $2, $3)', [outsider, share.id, card])).rejects.toThrow(/share_not_found/);
    await expect(as(b, 'select public.import_shared_deck($1, $2, $3)', [b, share.id, card])).rejects.toThrow(/permission denied/);
  });
});

describe('통합 노트', () => {
  it('allow_merge 공유만 재료가 되고, 노트는 그룹원만 본다', async () => {
    const deckB = await makeDeck(b);
    const [sb] = await as<{ id: string }>(b, 'select public.share_deck($1, $2, false, false, false) id', [groupId, deckB]);
    const [sa] = (await db.query('select id from public.deck_shares where deck_id = $1', [deckA])).rows;
    const content = JSON.stringify({ sections: [{ heading: '광합성', points: ['빛 에너지'] }], differences: [] });
    await expect(
      svc(`select public.save_group_note($1, $2, '통합', '과학', $3, $4)`, [a, groupId, content, [sa.id, sb!.id]]),
    ).rejects.toThrow(/invalid_sources/);

    await as(b, 'select public.share_deck($1, $2, false, true, false)', [groupId, deckB]);
    const [n] = await svc<{ id: string }>(`select public.save_group_note($1, $2, '통합', '과학', $3, $4) id`, [a, groupId, content, [sa.id, sb!.id]]);
    expect(await as(b, 'select id from public.group_notes where id = $1', [n!.id])).toHaveLength(1);
    expect(await as(outsider, 'select id from public.group_notes where id = $1', [n!.id])).toHaveLength(0);
  });
});

describe('주간 목표·보스·구조대·불꽃', () => {
  it('XP를 받은 정답이 목표와 보스에 반영되고, 쓰러뜨리면 전원 보상', async () => {
    // 작게 만들어 빨리 쓰러뜨린다
    await db.query(`update public.game_config set value = '1' where key = 'group.boss_hp_per_member'`);
    await db.query(`update public.game_config set value = '1' where key = 'group.goal_per_member'`);
    const before = (await db.query('select stars from public.profiles where id = $1', [b])).rows[0].stars;

    const [q] = (await db.query('select id from public.questions where deck_id = $1 order by id limit 1', [deckA])).rows;
    const r = await answer(a, q.id, 0);
    expect(r.events).toEqual(expect.arrayContaining(['review.correct', 'group.boss_hit']));

    const [boss] = (await db.query('select hp, max_hp, defeated_at from public.group_bosses where group_id = $1', [groupId])).rows;
    expect(boss.max_hp).toBe(2);
    expect(boss.hp).toBe(1);

    const [q2] = (await db.query('select id from public.questions where deck_id = $1 order by id offset 1 limit 1', [deckA])).rows;
    const r2 = await answer(a, q2.id, 0);
    expect(r2.events).toEqual(expect.arrayContaining(['group.goal_complete', 'group.boss_defeated']));

    const after = (await db.query('select stars from public.profiles where id = $1', [b])).rows[0].stars;
    expect(after - before).toBe(20 + 15); // 목표 + 보스, 안 푼 그룹원도 함께 받는다
    const kinds = (await as<{ kind: string }>(b, 'select kind from public.group_events where group_id = $1 order by id', [groupId])).map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['goal.completed', 'boss.defeated']));
  });

  it('틀린 답은 보스에 대미지가 없다', async () => {
    const [q] = (await db.query('select id from public.questions where deck_id = $1 order by id offset 2 limit 1', [deckA])).rows;
    const r = await answer(a, q.id, 1);
    expect(r.events).not.toContain('group.boss_hit');
  });

  it('오답 구조대: 둘 다 틀린 공유 문제를 한 명이 교정하면 구조 소식', async () => {
    const [copyDeck] = (await db.query('select id from public.decks where owner_id = $1 and source_deck_id = $2', [b, deckA])).rows;
    const [orig] = (await db.query('select id from public.questions where deck_id = $1 order by id offset 2 limit 1', [deckA])).rows;
    const [copy] = (await db.query('select id from public.questions where deck_id = $1 and origin_question_id = $2', [copyDeck.id, orig.id])).rows;
    await answer(b, copy.id, 1); // b도 틀림 → a(앞 테스트)와 b 둘 다 오답노트

    const origins = await as<{ origin_id: string; wrong_members: number }>(b, 'select * from public.group_rescue_origins($1)', [groupId]);
    expect(origins).toEqual([{ origin_id: orig.id, wrong_members: 2 }]);

    const [s] = await as<{ id: string }>(b, 'select public.start_rescue_session($1) id', [groupId]);
    const [session] = (await db.query('select question_ids from public.review_sessions where id = $1', [s!.id])).rows;
    expect(session.question_ids).toEqual([copy.id]);

    const fixed = await answer(b, copy.id, 0, 'maybe', s!.id);
    expect(fixed.events).toEqual(expect.arrayContaining(['wrong.fixed', 'group.rescue']));
  });

  it('그룹 불꽃: 그룹원 모두 세트를 끝낸 날 +1, 콕 찌르기는 안 한 사람에게 하루 1회', async () => {
    const c = await student('셋째');
    const [{ invite_code }] = (await db.query('select invite_code from public.study_groups where id = $1', [groupId])).rows;
    await as(c, 'select public.join_group($1)', [invite_code]);

    // a는 오늘 세트를 끝냄
    const deck = await makeDeck(a, 1);
    const [sid] = await as<{ id: string }>(a, `select public.start_review_session('deck', $1) id`, [deck]);
    const [qid] = (await db.query('select question_ids[1] q from public.review_sessions where id = $1', [sid!.id])).rows;
    await answer(a, qid.q, 0, 'maybe', sid!.id);
    await svc('select public.complete_review_set($1, $2)', [a, sid!.id]);

    await as(a, 'select public.poke_member($1, $2)', [groupId, c]);
    await expect(as(a, 'select public.poke_member($1, $2)', [groupId, c])).rejects.toThrow(/already_poked/);
    await expect(as(c, 'select public.poke_member($1, $2)', [groupId, a])).rejects.toThrow(/already_done/);
    await expect(as(outsider, 'select public.poke_member($1, $2)', [groupId, c])).rejects.toThrow(/not_allowed/);

    let [grp] = (await db.query('select streak_count from public.study_groups where id = $1', [groupId])).rows;
    expect(grp.streak_count).toBe(0);

    // b, c도 끝내면 불꽃 +1
    for (const u of [b, c]) {
      const d = await makeDeck(u, 1);
      const [s] = await as<{ id: string }>(u, `select public.start_review_session('deck', $1) id`, [d]);
      const [q] = (await db.query('select question_ids[1] q from public.review_sessions where id = $1', [s!.id])).rows;
      await answer(u, q.q, 0, 'maybe', s!.id);
      await svc('select public.complete_review_set($1, $2)', [u, s!.id]);
    }
    [grp] = (await db.query('select streak_count from public.study_groups where id = $1', [groupId])).rows;
    expect(grp.streak_count).toBe(1);
  });

  it('소식에는 정해진 스티커로만 반응한다', async () => {
    const [e] = (await db.query('select id from public.group_events where group_id = $1 limit 1', [groupId])).rows;
    await as(b, 'select public.react_group_event($1, $2)', [e.id, 'clap']);
    await expect(as(b, 'select public.react_group_event($1, $2)', [e.id, '아무말'])).rejects.toThrow(/check/);
    await expect(as(outsider, 'select public.react_group_event($1, $2)', [e.id, 'clap'])).rejects.toThrow(/not_allowed/);
  });
});

describe('나가기와 공유 중단', () => {
  it('그룹장이 나가면 다음 사람이 그룹장, 내 공유는 내려간다', async () => {
    await as(a, 'select public.leave_group($1)', [groupId]);
    const [g] = (await db.query('select owner_id from public.study_groups where id = $1', [groupId])).rows;
    expect(g.owner_id).toBe(b);
    expect((await db.query('select id from public.deck_shares where deck_id = $1', [deckA])).rowCount).toBe(0);
    expect(await as(b, 'select id from public.materials where deck_id = $1', [deckA])).toHaveLength(0);
  });
});
