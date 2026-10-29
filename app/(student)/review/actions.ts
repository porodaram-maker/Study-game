'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireProfile } from '@/lib/auth/requireRole';
import { submitAnswer, SubmitError, type SubmitResult } from '@/lib/study/submit';
import { MISTAKE_TYPES, submitRequestSchema } from '@/lib/study/schemas';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const startSchema = z.object({ kind: z.enum(['daily', 'deck', 'wrong']), deckId: z.string().uuid().nullable() });

/** 복습 세트를 만들고(오늘 세트가 남아 있으면 이어서) 풀이 화면으로 보낸다. */
export async function startReview(kind: 'daily' | 'deck' | 'wrong', deckId: string | null = null) {
  const parsed = startSchema.parse({ kind, deckId });
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('start_review_session', { p_kind: parsed.kind, p_deck_id: parsed.deckId });
  if (error) throw new Error(error.message);
  redirect(data ? `/review?s=${data}` : '/review?empty=1');
}

export async function submitAnswerAction(input: unknown): Promise<Result<SubmitResult>> {
  const me = await requireProfile();
  const parsed = submitRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: '입력을 확인해 주세요' };
  try {
    return { ok: true, data: await submitAnswer(me.id, parsed.data, { allowEssay: false }) };
  } catch (error) {
    if (error instanceof SubmitError) return { ok: false, error: error.message };
    console.error('[submitAnswer]', error);
    return { ok: false, error: '잠시 후 다시 시도해 주세요' };
  }
}

export type SetSummary = { total: number; correct: number; overconfident: number; stars: number; streak: number; events: string[] };

export async function finishSet(sessionId: string): Promise<Result<SetSummary>> {
  const me = await requireProfile();
  if (!z.string().uuid().safeParse(sessionId).success) return { ok: false, error: '세트를 찾을 수 없어요' };
  const { data, error } = await createAdminClient().rpc('complete_review_set', {
    p_user_id: me.id,
    p_session_id: sessionId,
  });
  if (error) {
    if (error.message.includes('set_not_finished')) return { ok: false, error: '아직 안 푼 문제가 있어요' };
    console.error('[finishSet]', error);
    return { ok: false, error: '잠시 후 다시 시도해 주세요' };
  }
  return { ok: true, data: data as SetSummary };
}

/** 틀린 뒤 실수 유형 한 번 탭 (5.4, 선택). RLS와 컬럼 권한으로 본인 기록의 mistake_type만 바뀐다. */
export async function setMistakeType(attemptId: number, mistakeType: (typeof MISTAKE_TYPES)[number]): Promise<Result<null>> {
  await requireProfile();
  const parsed = z.object({ attemptId: z.number().int().positive(), mistakeType: z.enum(MISTAKE_TYPES) }).safeParse({ attemptId, mistakeType });
  if (!parsed.success) return { ok: false, error: '입력을 확인해 주세요' };
  const supabase = await createClient();
  const { error } = await supabase.from('attempts').update({ mistake_type: parsed.data.mistakeType }).eq('id', parsed.data.attemptId);
  if (error) return { ok: false, error: '저장하지 못했어요' };
  return { ok: true, data: null };
}
