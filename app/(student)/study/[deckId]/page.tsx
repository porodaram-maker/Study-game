import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth/requireRole';
import { progressByDeck } from '@/lib/study/progress';
import { JellyButton } from '@/components/ui/JellyButton';
import { StickerCard } from '@/components/ui/StickerCard';
import { ProgressCapsule } from '@/components/ui/ProgressCapsule';
import { FormMessage } from '@/components/ui/FormMessage';
import { startReview } from '../../review/actions';
import { deleteQuestion, reportQuestion } from './actions';

export const metadata = { title: '단원 · 픽셀공부방' };

const TYPE_LABEL: Record<string, string> = { mcq: '객관식', blank: '빈칸', ox_reason: 'OX', essay: '서술형', explain: '설명하기' };

export default async function DeckPage({
  params,
  searchParams,
}: {
  params: Promise<{ deckId: string }>;
  searchParams: Promise<{ new?: string; truncated?: string }>;
}) {
  const me = await requireProfile();
  const { deckId } = await params;
  const { new: isNew, truncated } = await searchParams;
  const supabase = await createClient();

  const { data: deck } = await supabase.from('decks').select('id, subject, title, mode').eq('id', deckId).maybeSingle();
  if (!deck) notFound();

  const [{ data: questions }, { data: reports }, progress] = await Promise.all([
    supabase.from('questions').select('id, type, concept, prompt').eq('deck_id', deckId).order('id'),
    supabase.from('reports').select('target_id').eq('reporter_id', me.id).eq('target_type', 'question'),
    progressByDeck(me.id, [deckId]),
  ]);
  const reported = new Set((reports ?? []).map((r) => r.target_id));
  const p = progress.get(deckId) ?? 0;

  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="text-sm text-ink-soft">
          {deck.subject} · {deck.mode === 'naesin' ? '내신' : '수능'}
        </span>
        <h1 className="text-xl">{deck.title}</h1>
        <div className="flex items-center gap-3">
          <ProgressCapsule value={p} label="기억 진행" />
          <span className="w-10 shrink-0 text-right font-pixel text-sm">{Math.round(p * 100)}%</span>
        </div>
      </div>

      {isNew ? (
        <FormMessage tone="info">
          문제 {questions?.length ?? 0}개를 만들었어요. 한 번 훑어보고 이상한 문제는 지우거나 신고해 주세요.
          {truncated ? ' 자료가 길어서 앞부분으로만 만들었어요. 나머지는 단원을 나눠 올려 주세요.' : ''}
        </FormMessage>
      ) : null}

      <form action={startReview.bind(null, 'deck', deckId)}>
        <JellyButton type="submit" block disabled={!questions?.length}>
          공부하기
        </JellyButton>
      </form>

      <ul className="flex flex-col gap-3">
        {(questions ?? []).map((q, i) => (
          <li key={q.id}>
            <StickerCard className="flex flex-col gap-2">
              <span className="text-xs text-ink-soft">
                <span className="font-pixel">{i + 1}</span> · {TYPE_LABEL[q.type] ?? q.type} · {q.concept}
              </span>
              <p>{q.prompt}</p>
              <div className="flex justify-end gap-2">
                <form action={reportQuestion.bind(null, deckId, q.id)}>
                  <JellyButton type="submit" size="sm" variant="plain" disabled={reported.has(q.id)}>
                    {reported.has(q.id) ? '신고됨' : '신고'}
                  </JellyButton>
                </form>
                <form action={deleteQuestion.bind(null, deckId, q.id)}>
                  <JellyButton type="submit" size="sm" variant="plain">
                    삭제
                  </JellyButton>
                </form>
              </div>
            </StickerCard>
          </li>
        ))}
      </ul>
    </>
  );
}
