import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { candidatesFor, newCard, type StoredCard } from '@/lib/srs/fsrs';
import { asService, asUser, createAuthUser, createTestDatabase, type Db } from './harness';

let db: Db;
let drop: () => Promise<void>;
let student: string;
let other: string;

const DAY = 24 * 60 * 60 * 1000;

const QUESTIONS = [
  ...Array.from({ length: 7 }, (_, i) => ({
    concept: `개념${i % 3}`,
    type: 'mcq',
    prompt: `객관식 ${i}`,
    options: ['가', '나', '다', '라'],
    answer: i % 4,
    explanation: '해설',
  })),
  { concept: '빈칸', type: 'blank', prompt: '광합성은 ___에서 일어난다', answer: ['엽록체', 'chloroplast'], explanation: '해설' },
  { concept: 'OX', type: 'ox_reason', prompt: '물은 100도에서 끓는다', options: ['1기압일 때', '항상'], answer: { ox: 'O', reason: 0 }, explanation: '해설' },
  { concept: '서술', type: 'essay', prompt: '설명하시오', answer: '모범 답안', rubric: [{ point: '핵심', keywords: ['빛'], score: 1 }], explanation: '해설' },
];

async function onboard(uid: string, nickname: string) {
  await asUser(db, uid, () => db.query('select public.create_profile($1, 2::smallint)', [nickname]));
}

async function createDeck(uid: string, now = new Date()) {
  const { rows } = await asService(db, () =>
    db.query(
      `select public.create_generated_deck($1, '과학', '광합성', 'naesin', '자료', 'hash1', $2, $3) as id`,
      [uid, JSON.stringify(QUESTIONS), JSON.stringify(newCard(now))],
    ),
  );
  return rows[0].id as string;
}

async function startSession(uid: string, kind: string, deckId: string | null = null) {
  const { rows } = await asUser(db, uid, () => db.query('select public.start_review_session($1, $2) as id', [kind, deckId]));
  return rows[0].id as string | null;
}

async function sessionQuestions(uid: string, sessionId: string) {
  const { rows } = await asUser(db, uid, () =>
    db.query(
      `select q.id, q.type, q.answer, c.fsrs
         from public.review_sessions s
         cross join lateral unnest(s.question_ids) with ordinality as u(qid, ord)
         join public.questions q on q.id = u.qid
         left join public.card_states c on c.question_id = q.id and c.user_id = s.user_id
        where s.id = $1 order by u.ord`,
      [sessionId],
    ),
  );
  return rows as { id: string; type: string; answer: unknown; fsrs: StoredCard | null }[];
}

function rightAnswer(type: string, answer: unknown): unknown {
  if (type === 'blank') return ' 엽 록 체 ';
  return answer;
}

function wrongAnswer(type: string, answer: unknown): unknown {
  if (type === 'mcq') return ((answer as number) + 1) % 4;
  if (type === 'blank') return '미토콘드리아';
  if (type === 'ox_reason') return { ox: 'O', reason: 1 };
  return '틀린 답';
}

async function submit(
  uid: string,
  sessionId: string | null,
  q: { id: string; type: string; fsrs: StoredCard | null },
  picked: unknown,
  confidence: 'sure' | 'maybe' | 'guess',
  now: Date,
  essay: unknown = null,
) {
  const candidates = candidatesFor(q.fsrs, now, 0.9);
  const { rows } = await asService(db, () =>
    db.query('select public.submit_answer($1,$2,$3,$4,$5,$6,$7,$8,$9) as r', [
      uid,
      sessionId,
      q.id,
      JSON.stringify(picked),
      confidence,
      1200,
      JSON.stringify(candidates),
      q.fsrs?.reps ?? 0,
      essay === null ? null : JSON.stringify(essay),
    ]),
  );
  return rows[0].r as { correct: boolean; rating: number; due: string; events: string[]; attempt_id: number };
}

beforeAll(async () => {
  ({ client: db, drop } = await createTestDatabase());
  student = await createAuthUser(db);
  other = await createAuthUser(db);
  await onboard(student, '공부왕');
  await onboard(other, '남의학생');
});

afterAll(async () => {
  await drop?.();
});

describe('완료 기준: 문제 생성 → 10문제 풀기 → 다음 날 복습 목록', () => {
  it('어제 푼 세트 중 틀린 문제는 오늘 복습에 나오고, 맞힌 문제는 나오지 않는다', async () => {
    await createDeck(student);

    // 새 카드는 바로 오늘의 복습에 들어간다
    const sessionId = await startSession(student, 'daily');
    expect(sessionId).not.toBeNull();
    const questions = await sessionQuestions(student, sessionId!);
    expect(questions).toHaveLength(10);

    // 같은 날 다시 열면 같은 세트를 이어서 푼다
    expect(await startSession(student, 'daily')).toBe(sessionId);

    // 시계 조작: 세트를 "어제" 푼 것으로 스케줄한다
    const yesterday = new Date(Date.now() - DAY);
    const wrongIds: string[] = [];
    for (const [i, q] of questions.entries()) {
      const wrong = i < 3; // 3문제 틀림
      if (wrong) wrongIds.push(q.id);
      const essay = q.type === 'essay' ? { score: wrong ? 0.2 : 0.9, missing: [] } : null;
      const picked = wrong ? wrongAnswer(q.type, q.answer) : rightAnswer(q.type, q.answer);
      const result = await submit(student, sessionId, q, picked, i === 0 ? 'sure' : 'maybe', yesterday, essay);
      expect(result.correct).toBe(!wrong);
      expect(result.rating).toBe(wrong ? 1 : 3);
      if (i === questions.length - 1) expect(result.events).toContain('set.answered');
    }

    const { rows: summary } = await asService(db, () =>
      db.query('select public.complete_review_set($1, $2) as r', [student, sessionId]),
    );
    expect(summary[0].r).toMatchObject({ total: 10, correct: 7, overconfident: 1 });
    expect(summary[0].r.events).toContain('set.complete');

    // 오늘: 틀린 3문제는 1일 뒤라 다시 나오고, 맞힌(Good) 7문제는 3일 뒤라 아직 안 나온다
    const { rows: due } = await asUser(db, student, () =>
      db.query('select question_id from public.card_states where due <= now()'),
    );
    expect(due.map((r) => r.question_id).sort()).toEqual([...wrongIds].sort());

    const today = await startSession(student, 'daily');
    expect(today).not.toBe(sessionId);
    const todayQs = await sessionQuestions(student, today!);
    expect(todayQs.map((q) => q.id).sort()).toEqual([...wrongIds].sort());
  });

  it('완료하지 않은 세트는 완료 처리할 수 없다', async () => {
    const deckId = await createDeck(student);
    const sessionId = await startSession(student, 'deck', deckId);
    await expect(
      asService(db, () => db.query('select public.complete_review_set($1, $2)', [student, sessionId])),
    ).rejects.toThrow(/set_not_finished/);
  });
});

describe('채점과 오답노트', () => {
  it('유형별 채점: 빈칸은 공백·대소문자 무시, OX+이유는 둘 다 맞아야 정답', async () => {
    const grade = async (type: string, answer: unknown, picked: unknown) =>
      (await db.query('select public.grade_answer($1, $2, $3) as ok', [type, JSON.stringify(answer), JSON.stringify(picked)])).rows[0].ok;
    expect(await grade('mcq', 2, 2)).toBe(true);
    expect(await grade('mcq', 2, '2')).toBe(false);
    expect(await grade('blank', ['Chloroplast'], ' chloro plast.')).toBe(true);
    expect(await grade('blank', '엽록체', '엽록')).toBe(false);
    expect(await grade('blank', [''], '')).toBe(false);
    expect(await grade('ox_reason', { ox: 'X', reason: 1 }, { ox: 'X', reason: 1 })).toBe(true);
    expect(await grade('ox_reason', { ox: 'X', reason: 1 }, { ox: 'X', reason: 0 })).toBe(false);
    expect(await grade('ox_reason', { ox: 'X', reason: 1 }, { ox: 'O', reason: 1 })).toBe(false);
    await expect(grade('essay', '답', '내 답')).rejects.toThrow(/essay_grade_required/);
  });

  it('확실했는데 틀리면 overconfident, 다시 맞히면 오답노트에서 빠지고 교정 이벤트', async () => {
    const deckId = await createDeck(other);
    const sessionId = await startSession(other, 'deck', deckId);
    const [q] = await sessionQuestions(other, sessionId!);
    const now = new Date();

    const wrong = await submit(other, sessionId, q!, wrongAnswer(q!.type, q!.answer), 'sure', now, q!.type === 'essay' ? { score: 0 } : null);
    expect(wrong.events).toEqual(['review.wrong', 'review.overconfident']);
    const { rows: s1 } = await asUser(db, other, () =>
      db.query('select in_wrong_note, overconfident from public.card_states where question_id = $1', [q!.id]),
    );
    expect(s1[0]).toEqual({ in_wrong_note: true, overconfident: true });

    // 오답노트 세트로 다시 풀기
    const wrongSession = await startSession(other, 'wrong');
    const [again] = await sessionQuestions(other, wrongSession!);
    expect(again!.id).toBe(q!.id);
    const fixed = await submit(other, wrongSession, again!, rightAnswer(again!.type, again!.answer), 'maybe', now, again!.type === 'essay' ? { score: 1 } : null);
    expect(fixed.events).toEqual(expect.arrayContaining(['review.correct', 'wrong.overconfident_fixed', 'set.answered']));
    const { rows: s2 } = await asUser(db, other, () =>
      db.query('select in_wrong_note, overconfident from public.card_states where question_id = $1', [q!.id]),
    );
    expect(s2[0]).toEqual({ in_wrong_note: false, overconfident: false });

    // 지난 기록은 attempts에 남는다
    const { rows: hist } = await asUser(db, other, () =>
      db.query('select correct from public.attempts where question_id = $1 order by id', [q!.id]),
    );
    expect(hist.map((r) => r.correct)).toEqual([false, true]);
  });

  it('같은 세트에서 같은 문제를 두 번 제출할 수 없고, 낡은 카드 상태는 거부한다', async () => {
    const deckId = await createDeck(other);
    const sessionId = await startSession(other, 'deck', deckId);
    const [q] = await sessionQuestions(other, sessionId!);
    const picked = rightAnswer(q!.type, q!.answer);
    const essay = q!.type === 'essay' ? { score: 1 } : null;
    await submit(other, sessionId, q!, picked, 'maybe', new Date(), essay);
    await expect(submit(other, sessionId, q!, picked, 'maybe', new Date(), essay)).rejects.toThrow(/already_answered|stale_card/);
    await expect(submit(other, null, q!, picked, 'maybe', new Date(), essay)).rejects.toThrow(/stale_card/);
  });

  it('실수 유형은 본인 기록에만, 정해진 값만 고를 수 있다', async () => {
    const { rows } = await asUser(db, other, () =>
      db.query('select id from public.attempts where not correct order by id limit 1'),
    );
    const attemptId = rows[0].id;
    const ok = await asUser(db, other, () =>
      db.query(`update public.attempts set mistake_type = 'calc' where id = $1`, [attemptId]),
    );
    expect(ok.rowCount).toBe(1);
    await expect(
      asUser(db, other, () => db.query(`update public.attempts set mistake_type = 'lazy' where id = $1`, [attemptId])),
    ).rejects.toThrow(/mistake_type_check/);
    const theirs = await asUser(db, student, () =>
      db.query(`update public.attempts set mistake_type = 'calc' where id = $1`, [attemptId]),
    );
    expect(theirs.rowCount).toBe(0);
    await expect(
      asUser(db, other, () => db.query('update public.attempts set correct = true where id = $1', [attemptId])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('권한', () => {
  it('학생은 submit_answer·create_generated_deck·complete_review_set을 직접 부를 수 없다', async () => {
    for (const sql of [
      `select public.submit_answer($1, null, gen_random_uuid(), '0', 'sure', 0, '{}', 0, null)`,
      `select public.create_generated_deck($1, 'a', 'b', 'naesin', 'c', 'd', '[]', '{}')`,
      `select public.complete_review_set($1, gen_random_uuid())`,
    ]) {
      await expect(asUser(db, student, () => db.query(sql, [student]))).rejects.toThrow(/permission denied/);
    }
  });

  it('남의 문제·단원으로는 세트를 만들거나 답을 낼 수 없다', async () => {
    const deckId = await createDeck(student);
    await expect(startSession(other, 'deck', deckId)).rejects.toThrow(/deck_not_found/);
    const { rows } = await db.query('select id from public.questions where deck_id = $1 limit 1', [deckId]);
    await expect(
      submit(other, null, { id: rows[0].id, type: 'mcq', fsrs: null }, 0, 'sure', new Date()),
    ).rejects.toThrow(/question_not_found/);
  });

  it('다른 학생의 세트는 보이지 않는다', async () => {
    const { rows } = await asUser(db, other, () =>
      db.query('select id from public.review_sessions where user_id = $1', [student]),
    );
    expect(rows).toHaveLength(0);
  });
});

describe('app_day_start: KST 새벽 4시 경계', () => {
  it('KST 03:59는 전날, 04:00은 그날로 센다', async () => {
    const q = async (iso: string) =>
      (await db.query(`select to_char(public.app_day_start($1::timestamptz) at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') d`, [iso])).rows[0].d;
    expect(await q('2026-10-29T03:59:00+09:00')).toBe('2026-10-28 04:00');
    expect(await q('2026-10-29T04:00:00+09:00')).toBe('2026-10-29 04:00');
  });
});
