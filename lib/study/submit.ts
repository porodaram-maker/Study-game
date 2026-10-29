import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { configNumber } from '@/lib/game/config';
import { gradeEssay } from '@/lib/ai/client';
import { assertAiRate } from '@/lib/ai/limits';
import { candidatesFor, type StoredCard } from '@/lib/srs/fsrs';
import { pickedSchemas, type SubmitRequest } from './schemas';

export type SubmitResult = {
  attemptId: number;
  correct: boolean;
  answer: unknown;
  explanation: string;
  due: string;
  events: string[];
  essay?: { score: number; missingKeywords: string[]; questions: string[] };
};

export class SubmitError extends Error {
  constructor(
    public readonly code: 'not_found' | 'invalid_answer' | 'already_answered' | 'conflict',
    message: string,
  ) {
    super(message);
  }
}

type QuestionForGrading = {
  id: string;
  type: keyof typeof pickedSchemas | 'explain';
  prompt: string;
  answer: unknown;
  rubric: { point: string; keywords: string[]; score: number }[] | null;
};

async function loadQuestion(userId: string, questionId: string): Promise<QuestionForGrading> {
  const { data, error } = await createAdminClient()
    .from('questions')
    .select('id, type, prompt, answer, rubric, decks!inner(owner_id)')
    .eq('id', questionId)
    .eq('decks.owner_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new SubmitError('not_found', '문제를 찾을 수 없어요');
  return data as unknown as QuestionForGrading;
}

/**
 * 답 제출 (11.1). 채점·오답노트·FSRS 저장은 submit_answer(SQL)가 한 트랜잭션으로 한다.
 * 여기서는 서술형 AI 채점과 ts-fsrs 등급별 다음 상태 계산만 한다.
 */
export async function submitAnswer(userId: string, req: SubmitRequest, opts: { allowEssay: boolean }): Promise<SubmitResult> {
  const question = await loadQuestion(userId, req.questionId);
  if (question.type === 'explain') throw new SubmitError('invalid_answer', '아직 지원하지 않는 문제 유형이에요');
  if (question.type === 'essay' && !opts.allowEssay) throw new SubmitError('invalid_answer', '서술형은 채점 요청으로 보내 주세요');

  const picked = pickedSchemas[question.type].safeParse(req.picked);
  if (!picked.success) throw new SubmitError('invalid_answer', picked.error.issues[0]?.message ?? '답을 확인해 주세요');

  let essay: SubmitResult['essay'];
  let essayGrade: Record<string, unknown> | null = null;
  if (question.type === 'essay') {
    // AI 비용을 쓰기 전에 이미 낸 답인지 확인한다 (최종 확인은 submit_answer가 한다)
    const { count } = await createAdminClient()
      .from('attempts')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', req.sessionId)
      .eq('question_id', req.questionId);
    if ((count ?? 0) > 0) throw new SubmitError('already_answered', '이미 푼 문제예요');
    await assertAiRate(userId);
    const grade = await gradeEssay(userId, {
      prompt: question.prompt,
      modelAnswer: String(question.answer),
      rubric: question.rubric ?? [],
      answer: picked.data as string,
    });
    essay = { score: grade.score, missingKeywords: grade.missing_keywords, questions: grade.questions };
    essayGrade = { score: grade.score, met: grade.met, missing: grade.missing_keywords };
  }

  const admin = createAdminClient();
  const retention = await configNumber('srs_retention');

  // 동시에 같은 카드를 제출하면 stale_card가 난다. 상태를 다시 읽고 한 번만 재시도한다.
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: state, error: stateError } = await admin
      .from('card_states')
      .select('fsrs')
      .eq('user_id', userId)
      .eq('question_id', req.questionId)
      .maybeSingle();
    if (stateError) throw stateError;
    const stored = (state?.fsrs ?? null) as StoredCard | null;

    const { data, error } = await admin.rpc('submit_answer', {
      p_user_id: userId,
      p_session_id: req.sessionId,
      p_question_id: req.questionId,
      p_picked: picked.data,
      p_confidence: req.confidence,
      p_duration_ms: req.durationMs,
      p_candidates: candidatesFor(stored, new Date(), retention),
      p_prev_reps: stored?.reps ?? 0,
      p_essay: essayGrade,
    });
    if (error) {
      if (error.message.includes('stale_card') && attempt === 0) continue;
      if (error.message.includes('already_answered')) throw new SubmitError('already_answered', '이미 푼 문제예요');
      if (error.message.includes('not_in_session') || error.message.includes('question_not_found')) {
        throw new SubmitError('not_found', '문제를 찾을 수 없어요');
      }
      if (error.message.includes('stale_card')) throw new SubmitError('conflict', '다른 곳에서 먼저 풀었어요. 새로고침해 주세요');
      throw error;
    }
    const r = data as {
      attempt_id: number;
      correct: boolean;
      answer: unknown;
      explanation: string;
      due: string;
      events: string[];
    };
    return { attemptId: r.attempt_id, correct: r.correct, answer: r.answer, explanation: r.explanation, due: r.due, events: r.events, essay };
  }
  throw new SubmitError('conflict', '잠시 후 다시 시도해 주세요');
}
