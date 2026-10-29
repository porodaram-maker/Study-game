import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth/requireRole';
import { EmptyState } from '@/components/ui/EmptyState';
import { JellyButton, JellyLink } from '@/components/ui/JellyButton';
import { StickerCard } from '@/components/ui/StickerCard';
import { ReviewSession } from '@/components/study/ReviewSession';
import type { ReviewQuestion } from '@/components/study/types';
import { startReview } from './actions';

export const metadata = { title: '복습 · 픽셀공부방' };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ s?: string; empty?: string }> }) {
  const me = await requireProfile();
  const { s } = await searchParams;
  const supabase = await createClient();

  if (s) {
    const { data: session } = await supabase.from('review_sessions').select('id, question_ids').eq('id', s).maybeSingle();
    if (!session) {
      return <EmptyState title="세트를 찾을 수 없어요" body="오늘의 복습을 다시 시작해 주세요." action={<JellyLink href="/review">돌아가기</JellyLink>} />;
    }
    const ids = session.question_ids as string[];
    // 정답·해설은 보내지 않는다. 답을 낸 뒤 submit_answer가 돌려준다.
    const [{ data: rows }, { data: answered }] = await Promise.all([
      supabase.from('questions').select('id, type, concept, prompt, options').in('id', ids),
      supabase.from('attempts').select('question_id').eq('session_id', s),
    ]);
    const byId = new Map((rows ?? []).map((q) => [q.id as string, q as ReviewQuestion]));
    const questions = ids.map((id) => byId.get(id)).filter((q): q is ReviewQuestion => Boolean(q));
    return <ReviewSession sessionId={session.id} questions={questions} answeredIds={(answered ?? []).map((a) => a.question_id as string)} />;
  }

  const [{ count: due }, { count: wrong }] = await Promise.all([
    supabase.from('card_states').select('question_id', { count: 'exact', head: true }).eq('user_id', me.id).lte('due', new Date().toISOString()),
    supabase.from('card_states').select('question_id', { count: 'exact', head: true }).eq('user_id', me.id).eq('in_wrong_note', true),
  ]);

  if (!due) {
    return (
      <>
        <h1 className="text-xl">오늘의 복습</h1>
        <EmptyState
          title="오늘 복습은 다 했어요"
          body="복습할 때가 된 문제가 생기면 여기 모여요."
          action={<JellyLink href="/study">공부하러 가기</JellyLink>}
        />
      </>
    );
  }

  return (
    <>
      <h1 className="text-xl">오늘의 복습</h1>
      <StickerCard className="flex flex-col gap-2">
        <p>
          복습할 문제 <span className="font-pixel text-lg">{due}</span>개
        </p>
        {wrong ? (
          <p className="text-sm text-ink-soft">
            오답노트 문제 <span className="font-pixel">{wrong}</span>개를 먼저 풀어요.
          </p>
        ) : null}
        <p className="text-sm text-ink-soft">한 세트는 여러 단원을 섞어서 나와요.</p>
      </StickerCard>
      <form action={startReview.bind(null, 'daily', null)}>
        <JellyButton type="submit" block>
          복습 시작
        </JellyButton>
      </form>
    </>
  );
}
