import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeGenerated, type GeneratedSet } from '@/lib/ai/schemas';

const parse = vi.fn();
const inserts: unknown[] = [];

vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error {
    status = 500;
  }
  class Anthropic {
    static APIError = APIError;
    messages = { parse };
    beta = { messages: { parse } };
  }
  return { default: Anthropic };
});
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ insert: async (row: unknown) => inserts.push(row) }) }),
}));

const { generateQuestions, gradeEssay, AiError } = await import('@/lib/ai/client');

function setOf(n: number): GeneratedSet {
  return {
    concepts: ['개념'],
    questions: Array.from({ length: n }, (_, i) => ({
      type: 'mcq' as const,
      concept: '개념',
      prompt: `문제 ${i}`,
      options: ['가', '나', '다', '라'],
      answer_index: i % 4,
      accepted_answers: null,
      ox: null,
      model_answer: null,
      rubric: null,
      explanation: '해설',
    })),
  };
}

function reply(parsed: unknown, stop_reason = 'end_turn') {
  return { stop_reason, parsed_output: parsed, content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 100, output_tokens: 50 }, model: 'm' };
}

const input = { subject: '과학', title: '광합성', mode: 'naesin' as const, text: '자료' };
const validate = (set: GeneratedSet) => {
  const r = normalizeGenerated(set, 'naesin');
  return r.ok ? { ok: true as const, value: r.questions } : r;
};

beforeEach(() => {
  parse.mockReset();
  inserts.length = 0;
});

describe('generateQuestions', () => {
  it('검증에 실패하면 이유를 붙여 1회만 재시도하고, 사용량은 호출마다 남긴다', async () => {
    parse.mockResolvedValueOnce(reply(setOf(3))).mockResolvedValueOnce(reply(setOf(10)));
    const questions = await generateQuestions('u1', input, validate);
    expect(questions).toHaveLength(10);
    expect(parse).toHaveBeenCalledTimes(2);
    const retryMessages = parse.mock.calls[1]![0].messages;
    expect(retryMessages.at(-1).content).toMatch(/문제 수가 3개/);
    expect(inserts.map((r) => (r as { kind: string }).kind)).toEqual(['generate', 'generate_retry']);
  });

  it('두 번 다 실패하면 invalid_output', async () => {
    parse.mockResolvedValue(reply(setOf(3)));
    await expect(generateQuestions('u1', input, validate)).rejects.toMatchObject({ code: 'invalid_output' });
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it('거절(refusal)은 재시도하지 않는다', async () => {
    parse.mockResolvedValue(reply(null, 'refusal'));
    await expect(generateQuestions('u1', input, validate)).rejects.toBeInstanceOf(AiError);
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it('출력이 잘리면(max_tokens) 재시도한다', async () => {
    parse.mockResolvedValueOnce(reply(setOf(10), 'max_tokens')).mockResolvedValueOnce(reply(setOf(9)));
    expect(await generateQuestions('u1', input, validate)).toHaveLength(9);
  });
});

describe('gradeEssay', () => {
  const rubric = [
    { point: '빛 에너지', keywords: ['빛'], score: 2 },
    { point: '포도당 생성', keywords: ['포도당'], score: 1 },
  ];

  it('루브릭 배점으로 점수 비율을 계산하고 질문은 2개까지만', async () => {
    parse.mockResolvedValue(reply({ met: [true, false], missing_keywords: ['포도당'], questions: ['a', 'b', 'c'] }));
    const g = await gradeEssay('u1', { prompt: 'p', modelAnswer: 'm', rubric, answer: '빛을 쓴다' });
    expect(g.score).toBeCloseTo(2 / 3);
    expect(g.questions).toEqual(['a', 'b']);
    const params = parse.mock.calls[0]![0];
    expect(params.fallbacks).toBe('default');
    expect(params.system).toMatch(/대신 써주지 말고/);
  });

  it('루브릭 항목 수와 맞지 않으면 invalid_output', async () => {
    parse.mockResolvedValue(reply({ met: [true], missing_keywords: [], questions: [] }));
    await expect(gradeEssay('u1', { prompt: 'p', modelAnswer: 'm', rubric, answer: 'x' })).rejects.toMatchObject({ code: 'invalid_output' });
  });
});
