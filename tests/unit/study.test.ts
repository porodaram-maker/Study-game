import { describe, expect, it } from 'vitest';
import { estimateTokens, truncateToTokens } from '@/lib/ai/tokens';
import { normalizeGenerated, type GeneratedQuestion, type GeneratedSet } from '@/lib/ai/schemas';
import { candidatesFor, deckProgress, newCard, retrievability } from '@/lib/srs/fsrs';
import { contentHash } from '@/lib/study/hash';
import { generateRequestSchema, pickedSchemas } from '@/lib/study/schemas';

const DAY = 86_400_000;

function mcq(i: number): GeneratedQuestion {
  return {
    type: 'mcq',
    concept: '광합성',
    prompt: `문제 ${i}`,
    options: ['가', '나', '다', '라'],
    answer_index: i % 4,
    accepted_answers: null,
    ox: null,
    model_answer: null,
    rubric: null,
    explanation: '해설',
  };
}

function validSet(n = 10): GeneratedSet {
  return { concepts: ['광합성'], questions: Array.from({ length: n }, (_, i) => mcq(i)) };
}

describe('토큰 어림과 자르기', () => {
  it('한글은 글자당 1, 그 밖은 0.3', () => {
    expect(estimateTokens('가나다')).toBe(3);
    expect(estimateTokens('abcdefghij')).toBe(3);
  });
  it('한도를 넘으면 앞부분만 남기고 알린다', () => {
    expect(truncateToTokens('가나다라마', 3)).toEqual({ text: '가나다', truncated: true });
    expect(truncateToTokens('가나', 3)).toEqual({ text: '가나', truncated: false });
  });
});

describe('생성 결과 검사 normalizeGenerated', () => {
  it('정상 결과를 DB 모양으로 바꾼다', () => {
    const r = normalizeGenerated(
      {
        concepts: [],
        questions: [
          ...validSet(7).questions,
          { ...mcq(0), type: 'blank', prompt: '물은 ___에서 끓는다', options: null, answer_index: null, accepted_answers: ['100도'] },
          { ...mcq(0), type: 'ox_reason', options: ['이유1', '이유2'], answer_index: 1, ox: 'X' },
          {
            ...mcq(0),
            type: 'essay',
            options: null,
            answer_index: null,
            model_answer: '모범',
            rubric: [{ point: '핵심', keywords: ['빛'], score: 2 }],
          },
        ],
      },
      'naesin',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.questions[0]).toMatchObject({ type: 'mcq', answer: 0, options: ['가', '나', '다', '라'], rubric: null });
    expect(r.questions[7]).toMatchObject({ type: 'blank', answer: ['100도'], options: null });
    expect(r.questions[8]).toMatchObject({ type: 'ox_reason', answer: { ox: 'X', reason: 1 } });
    expect(r.questions[9]).toMatchObject({ type: 'essay', answer: '모범' });
  });

  it('문제 수, 보기 수, 빈칸 표시, 이유 번호, 수능 서술형을 잡아낸다', () => {
    expect(normalizeGenerated(validSet(5), 'naesin')).toMatchObject({ ok: false });
    const bad: GeneratedSet = validSet(8);
    bad.questions[0] = { ...mcq(0), options: ['가', '나', '다'] };
    bad.questions[1] = { ...mcq(0), type: 'blank', prompt: '빈칸 없음.', options: null, answer_index: null, accepted_answers: ['답'] };
    bad.questions[2] = { ...mcq(0), type: 'ox_reason', options: ['이유1', '이유2'], answer_index: 5, ox: 'O' };
    bad.questions[3] = { ...mcq(0), type: 'essay', options: null, answer_index: null, model_answer: '모범', rubric: [{ point: 'p', keywords: [], score: 1 }] };
    bad.questions[4] = { ...mcq(0), concept: '열 글자가 넘는 아주 긴 개념 이름' };
    const r = normalizeGenerated(bad, 'suneung');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.problems).toHaveLength(5);
    expect(r.problems.join('\n')).toMatch(/1번\(mcq\)/);
    expect(r.problems.join('\n')).toMatch(/빈칸 표시/);
    expect(r.problems.join('\n')).toMatch(/이유 정답 번호/);
    expect(r.problems.join('\n')).toMatch(/수능 모드/);
  });
});

describe('FSRS 래퍼', () => {
  const now = new Date('2026-10-29T03:00:00Z');

  it('새 카드: 틀림은 1일 뒤, 확신이 높을수록 간격이 길다 (분 단위 학습 단계 없음)', () => {
    const c = candidatesFor(null, now, 0.9);
    const days = (k: '1' | '2' | '3' | '4') => (new Date(c[k].due).getTime() - now.getTime()) / DAY;
    expect(days('1')).toBe(1);
    expect(days('1')).toBeLessThan(days('2'));
    expect(days('2')).toBeLessThan(days('3'));
    expect(days('3')).toBeLessThan(days('4'));
  });

  it('목표 기억률이 높으면 간격이 짧아진다', () => {
    const lo = candidatesFor(null, now, 0.8)['3'].due;
    const hi = candidatesFor(null, now, 0.95)['3'].due;
    expect(new Date(hi).getTime()).toBeLessThan(new Date(lo).getTime());
  });

  it('저장·복원을 거쳐도 다음 상태 계산이 같다', () => {
    const first = candidatesFor(null, now, 0.9)['3'].card;
    const later = new Date(now.getTime() + 3 * DAY);
    const roundTripped = JSON.parse(JSON.stringify(first));
    expect(candidatesFor(roundTripped, later, 0.9)['3'].due).toBe(candidatesFor(first, later, 0.9)['3'].due);
  });

  it('진행 바: 안 푼 카드는 0, 방금 푼 카드는 1에 가깝고 시간이 지나면 떨어진다', () => {
    expect(retrievability(newCard(now), now, 0.9)).toBe(0);
    const reviewed = candidatesFor(null, now, 0.9)['3'].card;
    expect(retrievability(reviewed, now, 0.9)).toBeGreaterThan(0.99);
    expect(retrievability(reviewed, new Date(now.getTime() + 30 * DAY), 0.9)).toBeLessThan(0.9);
    expect(deckProgress([reviewed, newCard(now)], now, 0.9)).toBeCloseTo(0.5, 1);
    expect(deckProgress([], now, 0.9)).toBe(0);
  });
});

describe('입력 검증', () => {
  it('같은 자료는 공백이 달라도 같은 해시, 모드가 다르면 다른 해시', () => {
    expect(contentHash('naesin', '광합성은\n 빛을  쓴다')).toBe(contentHash('naesin', '광합성은 빛을 쓴다'));
    expect(contentHash('naesin', 'a')).not.toBe(contentHash('suneung', 'a'));
  });

  it('생성 요청: 너무 짧은 자료와 모르는 과목은 거절', () => {
    const ok = { subject: '과학', title: '광합성', mode: 'naesin', text: '가'.repeat(100) };
    expect(generateRequestSchema.safeParse(ok).success).toBe(true);
    expect(generateRequestSchema.safeParse({ ...ok, text: '짧음' }).success).toBe(false);
    expect(generateRequestSchema.safeParse({ ...ok, subject: '체육' }).success).toBe(false);
  });

  it('유형별 답 형식', () => {
    expect(pickedSchemas.mcq.safeParse(3).success).toBe(true);
    expect(pickedSchemas.mcq.safeParse(4).success).toBe(false);
    expect(pickedSchemas.ox_reason.safeParse({ ox: 'O', reason: 1 }).success).toBe(true);
    expect(pickedSchemas.ox_reason.safeParse({ ox: 'Y', reason: 1 }).success).toBe(false);
    expect(pickedSchemas.blank.safeParse('   ').success).toBe(false);
  });
});
