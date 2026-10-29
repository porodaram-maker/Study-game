'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireProfile } from '@/lib/auth/requireRole';
import { configNumber } from '@/lib/game/config';
import { daysUntil } from '@/lib/game/level';
import { retrievability, type StoredCard } from '@/lib/srs/fsrs';

export type ExamFormState = { error?: string } | null;

const examSchema = z.object({
  name: z.string().trim().min(1, '시험 이름을 적어 주세요').max(30, '30자까지예요'),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜를 골라 주세요'),
  deckIds: z.array(z.string().uuid()).max(50),
});

/** 시험 등록 + 범위 단원 연결 (10장 /exams) */
export async function createExam(_: ExamFormState, form: FormData): Promise<ExamFormState> {
  const me = await requireProfile();
  const parsed = examSchema.safeParse({
    name: form.get('name'),
    examDate: form.get('examDate'),
    deckIds: form.getAll('deckIds'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? '입력을 확인해 주세요' };

  const supabase = await createClient();
  const { data: today } = await supabase.rpc('app_day');
  if (daysUntil(parsed.data.examDate, today as string) < 0) return { error: '지난 날짜예요' };

  const { data: exam, error } = await supabase
    .from('exams')
    .insert({ user_id: me.id, name: parsed.data.name, exam_date: parsed.data.examDate, scope: { deck_ids: parsed.data.deckIds } })
    .select('id')
    .single();
  if (error) return { error: '저장하지 못했어요' };
  if (parsed.data.deckIds.length > 0) {
    await supabase.from('decks').update({ exam_id: exam.id }).in('id', parsed.data.deckIds).eq('owner_id', me.id);
  }
  revalidatePath('/exams');
  revalidatePath('/home');
  return null;
}

export async function deleteExam(examId: string) {
  await requireProfile();
  if (!z.string().uuid().safeParse(examId).success) return;
  const supabase = await createClient();
  await supabase.from('exams').delete().eq('id', examId);
  revalidatePath('/exams');
  revalidatePath('/home');
}

/** 시험 D-7부터 범위 카드를 기억률 낮은 순으로 하루 한 세트 더 (5.3) */
export async function startExamReview(examId: string) {
  const me = await requireProfile();
  if (!z.string().uuid().safeParse(examId).success) redirect('/exams');
  const supabase = await createClient();
  const [{ data: exam }, { data: today }, boostDays, setSize, retention] = await Promise.all([
    supabase.from('exams').select('id, exam_date').eq('id', examId).maybeSingle(),
    supabase.rpc('app_day'),
    configNumber('exam.boost_days'),
    configNumber('review.set_size'),
    configNumber('srs_retention'),
  ]);
  if (!exam) redirect('/exams');
  const left = daysUntil(exam.exam_date, today as string);
  if (left < 0 || left > boostDays) redirect('/exams');

  const { data: cards } = await supabase
    .from('card_states')
    .select('question_id, fsrs, questions!inner(deck_id, decks!inner(exam_id))')
    .eq('user_id', me.id)
    .eq('questions.decks.exam_id', examId);
  const now = new Date();
  const ids = (cards ?? [])
    .map((c) => ({ id: c.question_id as string, r: retrievability(c.fsrs as StoredCard, now, retention) }))
    .sort((a, b) => a.r - b.r)
    .slice(0, setSize)
    .map((c) => c.id);
  if (ids.length === 0) redirect('/exams?empty=1');

  const { data: sessionId, error } = await createAdminClient().rpc('create_custom_session', {
    p_user_id: me.id,
    p_kind: 'exam',
    p_question_ids: ids,
    p_exam_id: examId,
  });
  if (error) redirect(error.message.includes('exam_set_used_today') ? '/exams?used=1' : '/exams');
  redirect(`/review?s=${sessionId}`);
}
