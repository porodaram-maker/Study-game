import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { configNumber } from '@/lib/game/config';
import { generateQuestions } from '@/lib/ai/client';
import { assertAiRate, generateCountToday, LimitError } from '@/lib/ai/limits';
import { normalizeGenerated, type QuestionRow } from '@/lib/ai/schemas';
import { truncateToTokens } from '@/lib/ai/tokens';
import { newCard } from '@/lib/srs/fsrs';
import { contentHash } from './hash';
import type { GenerateRequest } from './schemas';

/** 같은 자료(해시)로 이미 만든 문제가 있으면 가져온다 (5.1-2, AI 비용 절약) */
async function findReusable(hash: string): Promise<QuestionRow[] | null> {
  const admin = createAdminClient();
  const { data: materials, error } = await admin
    .from('materials')
    .select('deck_id')
    .eq('content_hash', hash)
    .order('created_at', { ascending: true })
    .limit(5);
  if (error) throw error;
  for (const m of materials ?? []) {
    const { data: questions, error: qError } = await admin
      .from('questions')
      .select('concept, type, prompt, options, answer, rubric, explanation')
      .eq('deck_id', m.deck_id);
    if (qError) throw qError;
    if (questions && questions.length >= 8) return questions as QuestionRow[];
  }
  return null;
}

export type GenerateResult = { deckId: string; reused: boolean; truncated: boolean; count: number };

export async function generateDeck(userId: string, input: GenerateRequest): Promise<GenerateResult> {
  const maxTokens = await configNumber('ai.max_input_tokens');
  const { text, truncated } = truncateToTokens(input.text, maxTokens);
  const hash = contentHash(input.mode, text);

  let questions = await findReusable(hash);
  const reused = questions !== null;

  if (!questions) {
    const { used, limit } = await generateCountToday(userId);
    if (used >= limit) throw new LimitError('daily', `오늘은 문제를 ${limit}번까지 만들 수 있어요. 내일 새벽 4시에 다시 열려요.`);
    await assertAiRate(userId);
    questions = await generateQuestions(userId, { ...input, text }, (set) => {
      const result = normalizeGenerated(set, input.mode);
      return result.ok ? { ok: true, value: result.questions } : result;
    });
  }

  const { data: deckId, error } = await createAdminClient().rpc('create_generated_deck', {
    p_user_id: userId,
    p_subject: input.subject,
    p_title: input.title,
    p_mode: input.mode,
    p_text: text,
    p_content_hash: hash,
    p_questions: questions,
    p_new_card: newCard(new Date()),
  });
  if (error) throw error;
  return { deckId: deckId as string, reused, truncated, count: questions.length };
}
