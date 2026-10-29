'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth/requireRole';

const id = z.string().uuid();

/** 이상한 문제 지우기 (5.1-4). RLS가 내 단원의 문제만 지우게 한다. */
export async function deleteQuestion(deckId: string, questionId: string) {
  await requireProfile();
  if (!id.safeParse(deckId).success || !id.safeParse(questionId).success) return;
  const supabase = await createClient();
  await supabase.from('questions').delete().eq('id', questionId).eq('deck_id', deckId);
  revalidatePath(`/study/${deckId}`);
}

/** 문제 신고 (5.1-4). 콘솔 검수 큐로 간다 (9.9). */
export async function reportQuestion(deckId: string, questionId: string) {
  const me = await requireProfile();
  if (!id.safeParse(deckId).success || !id.safeParse(questionId).success) return;
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('reports')
    .select('id')
    .eq('reporter_id', me.id)
    .eq('target_type', 'question')
    .eq('target_id', questionId)
    .maybeSingle();
  if (!existing) {
    await supabase.from('reports').insert({
      reporter_id: me.id,
      target_type: 'question',
      target_id: questionId,
      reason: 'generated_question_wrong',
    });
  }
  revalidatePath(`/study/${deckId}`);
}
