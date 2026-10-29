import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkMergedNote, essayGradeSchema, generatedSetSchema, mergedNoteSchema, type EssayGrade, type GeneratedSet, type MergedNote } from './schemas';
import { GENERATE_SYSTEM, GRADE_SYSTEM, MERGE_SYSTEM, generateUserPrompt, gradeUserPrompt, mergeUserPrompt, retryPrompt } from './prompts';

// 모델 이름은 환경변수로 (11.3). 생성은 작은 모델, 서술형 채점만 상위 모델.
const SMALL_MODEL = process.env.AI_MODEL_SMALL ?? 'claude-haiku-5-5';
const LARGE_MODEL = process.env.AI_MODEL_LARGE ?? 'claude-opus-5-5';

let client: Anthropic | null = null;
function anthropic() {
  client ??= new Anthropic();
  return client;
}

export class AiError extends Error {
  constructor(
    public readonly code: 'refused' | 'invalid_output' | 'upstream',
    message: string,
  ) {
    super(message);
  }
}

async function recordUsage(userId: string, kind: string, model: string, usage: { input_tokens: number; output_tokens: number }) {
  await createAdminClient().from('ai_usage').insert({
    user_id: userId,
    kind,
    model,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
  });
}

function wrapApiError(error: unknown): never {
  if (error instanceof AiError) throw error;
  if (error instanceof Anthropic.APIError) throw new AiError('upstream', `Claude API ${error.status}: ${error.message}`);
  throw error;
}

/**
 * 자료 → 문제 생성 (5.1). 결과는 validate로 검사하고, 실패하면 이유를 알려 주고 1회만 재시도한다.
 * 호출마다 ai_usage에 기록한다.
 */
export async function generateQuestions<T>(
  userId: string,
  input: { subject: string; title: string; mode: 'naesin' | 'suneung'; text: string },
  validate: (set: GeneratedSet) => { ok: true; value: T } | { ok: false; problems: string[] },
): Promise<T> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: generateUserPrompt(input) }];
  let lastProblems: string[] = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    let response;
    try {
      response = await anthropic().messages.parse({
        model: SMALL_MODEL,
        max_tokens: 16000,
        system: GENERATE_SYSTEM,
        messages,
        output_config: { format: zodOutputFormat(generatedSetSchema) },
      });
    } catch (error) {
      wrapApiError(error);
    }
    await recordUsage(userId, attempt === 0 ? 'generate' : 'generate_retry', SMALL_MODEL, response.usage);

    if (response.stop_reason === 'refusal') throw new AiError('refused', '이 자료로는 문제를 만들 수 없어요.');
    const parsed = response.stop_reason === 'max_tokens' ? null : response.parsed_output;
    const checked = parsed ? validate(parsed) : { ok: false as const, problems: ['출력이 형식에 맞지 않거나 잘렸습니다.'] };
    if (checked.ok) return checked.value;

    lastProblems = checked.problems;
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: retryPrompt(checked.problems) });
  }
  throw new AiError('invalid_output', `생성 결과 검증 실패: ${lastProblems.join(' / ')}`);
}

/** 서술형 루브릭 채점 (5.2). 상위 모델을 쓰고, 거절되면 서버 측 대체 모델로 넘긴다. */
export async function gradeEssay(
  userId: string,
  input: { prompt: string; modelAnswer: string; rubric: { point: string; keywords: string[]; score: number }[]; answer: string },
): Promise<EssayGrade & { score: number }> {
  let response;
  try {
    response = await anthropic().beta.messages.parse({
      model: LARGE_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: GRADE_SYSTEM,
      messages: [{ role: 'user', content: gradeUserPrompt(input) }],
      output_config: { format: zodOutputFormat(essayGradeSchema) },
    });
  } catch (error) {
    wrapApiError(error);
  }
  await recordUsage(userId, 'grade', response.model, response.usage);

  if (response.stop_reason === 'refusal') throw new AiError('refused', '이 답안은 채점할 수 없어요.');
  const grade = response.parsed_output;
  if (!grade || grade.met.length !== input.rubric.length) {
    throw new AiError('invalid_output', '채점 결과가 루브릭과 맞지 않습니다.');
  }
  const total = input.rubric.reduce((s, r) => s + r.score, 0);
  const earned = input.rubric.reduce((s, r, i) => s + (grade.met[i] ? r.score : 0), 0);
  return { ...grade, questions: grade.questions.slice(0, 2), score: total > 0 ? earned / total : 0 };
}

/** 그룹 자료 여러 개 → 통합 노트 (8.6). 작은 모델, 검증 실패 시 1회 재시도. */
export async function mergeNotes(userId: string, input: { subject: string; title: string; sources: string[] }): Promise<MergedNote> {
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: mergeUserPrompt(input) }];
  let lastProblems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    let response;
    try {
      response = await anthropic().messages.parse({
        model: SMALL_MODEL,
        max_tokens: 16000,
        system: MERGE_SYSTEM,
        messages,
        output_config: { format: zodOutputFormat(mergedNoteSchema) },
      });
    } catch (error) {
      wrapApiError(error);
    }
    await recordUsage(userId, attempt === 0 ? 'merge' : 'merge_retry', SMALL_MODEL, response.usage);
    if (response.stop_reason === 'refusal') throw new AiError('refused', '이 자료로는 노트를 만들 수 없어요.');
    const parsed = response.stop_reason === 'max_tokens' ? null : response.parsed_output;
    const checked = parsed ? checkMergedNote(parsed) : { ok: false as const, problems: ['출력이 형식에 맞지 않거나 잘렸습니다.'] };
    if (checked.ok) return checked.value;
    lastProblems = checked.problems;
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: retryPrompt(checked.problems) });
  }
  throw new AiError('invalid_output', `통합 노트 검증 실패: ${lastProblems.join(' / ')}`);
}
