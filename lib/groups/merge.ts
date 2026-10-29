import 'server-only';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { configNumber } from '@/lib/game/config';
import { mergeNotes } from '@/lib/ai/client';
import { assertAiRate, LimitError, mergeCountToday } from '@/lib/ai/limits';
import { truncateToTokens } from '@/lib/ai/tokens';
import { SUBJECTS } from '@/lib/study/schemas';

export const mergeRequestSchema = z.object({
  groupId: z.string().uuid(),
  shareIds: z.array(z.string().uuid()).min(2, '자료를 2개 이상 골라 주세요').max(6, '6개까지 고를 수 있어요'),
  title: z.string().trim().min(1, '노트 이름을 적어 주세요').max(40),
  subject: z.enum(SUBJECTS),
});
export type MergeRequest = z.infer<typeof mergeRequestSchema>;

export class MergeError extends Error {}

/**
 * 그룹원 각자의 자료로 통합 노트를 만든다 (8.6).
 * 재료는 그룹에 공유되고 올린 사람이 통합 노트 재료로 허용한 단원의 원문뿐이다.
 * 원문은 AI 입력으로만 쓰이고, 원문 공개를 켜지 않은 자료의 원문은 그룹원에게 보이지 않는다.
 */
export async function createGroupNote(userId: string, req: MergeRequest): Promise<string> {
  const admin = createAdminClient();
  const { data: member } = await admin
    .from('group_members')
    .select('user_id')
    .eq('group_id', req.groupId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!member) throw new MergeError('그룹원만 만들 수 있어요');

  const { data: shares, error } = await admin
    .from('deck_shares')
    .select('id, deck:decks!inner(materials(extracted_text))')
    .in('id', req.shareIds)
    .eq('group_id', req.groupId)
    .eq('allow_merge', true)
    .is('hidden_at', null);
  if (error) throw error;
  if (!shares || shares.length !== req.shareIds.length) throw new MergeError('고른 자료 중 쓸 수 없는 것이 있어요');

  const { used, limit } = await mergeCountToday(userId);
  if (used >= limit) throw new LimitError('daily', `통합 노트는 하루 ${limit}번까지 만들 수 있어요.`);
  await assertAiRate(userId);

  // 자료 순서는 고른 순서대로, 전체 입력은 ai.max_input_tokens 안에서 나눠 쓴다
  const perSource = Math.floor((await configNumber('ai.max_input_tokens')) / req.shareIds.length);
  const byId = new Map(shares.map((s) => [s.id as string, s]));
  const sources = req.shareIds.map((id) => {
    const row = byId.get(id) as unknown as { deck: { materials: { extracted_text: string | null }[] } };
    const text = row.deck.materials.map((m) => m.extracted_text ?? '').join('\n\n').trim();
    return truncateToTokens(text, perSource).text;
  });
  if (sources.some((t) => t.length === 0)) throw new MergeError('원문이 없는 자료가 있어요');

  const note = await mergeNotes(userId, { subject: req.subject, title: req.title, sources });
  const { data: noteId, error: saveError } = await admin.rpc('save_group_note', {
    p_user_id: userId,
    p_group_id: req.groupId,
    p_title: req.title,
    p_subject: req.subject,
    p_content: note,
    p_share_ids: req.shareIds,
  });
  if (saveError) throw saveError;
  return noteId as string;
}
