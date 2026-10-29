import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { configNumber } from '@/lib/game/config';
import { deckProgress, type StoredCard } from '@/lib/srs/fsrs';

/** 단원별 기억 진행 (5.3): 카드 기억 확률 평균, 안 푼 카드는 0 */
export async function progressByDeck(userId: string, deckIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (deckIds.length === 0) return result;
  const supabase = await createClient();
  const [{ data }, retention] = await Promise.all([
    supabase.from('card_states').select('fsrs, questions!inner(deck_id)').eq('user_id', userId).in('questions.deck_id', deckIds),
    configNumber('srs_retention'),
  ]);
  const cards = new Map<string, StoredCard[]>();
  for (const row of (data ?? []) as unknown as { fsrs: StoredCard; questions: { deck_id: string } }[]) {
    const list = cards.get(row.questions.deck_id) ?? [];
    list.push(row.fsrs);
    cards.set(row.questions.deck_id, list);
  }
  const now = new Date();
  for (const id of deckIds) result.set(id, deckProgress(cards.get(id) ?? [], now, retention));
  return result;
}
