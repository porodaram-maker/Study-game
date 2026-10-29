import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth/requireRole';
import { EmptyState } from '@/components/ui/EmptyState';
import { JellyButton, JellyLink } from '@/components/ui/JellyButton';
import { StickerCard } from '@/components/ui/StickerCard';
import { MISTAKE_LABELS, MISTAKE_TYPES, type MistakeType } from '@/lib/study/schemas';
import { startReview } from '../review/actions';

export const metadata = { title: '오답노트 · 픽셀공부방' };

type Row = {
  question_id: string;
  overconfident: boolean;
  last_wrong_at: string | null;
  questions: { prompt: string; concept: string; decks: { title: string } };
};

export default async function WrongPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const me = await requireProfile();
  const { m } = await searchParams;
  const filter = (MISTAKE_TYPES as readonly string[]).includes(m ?? '') ? (m as MistakeType) : null;
  const supabase = await createClient();

  // 5.4 정렬: 확실했는데 틀림 → 최근 틀림
  const { data } = await supabase
    .from('card_states')
    .select('question_id, overconfident, last_wrong_at, questions!inner(prompt, concept, decks!inner(title))')
    .eq('user_id', me.id)
    .eq('in_wrong_note', true)
    .order('overconfident', { ascending: false })
    .order('last_wrong_at', { ascending: false, nullsFirst: false });
  let rows = (data ?? []) as unknown as Row[];

  // 실수 유형 필터: 가장 최근에 틀린 기록의 실수 유형
  const mistakeOf = new Map<string, string | null>();
  if (rows.length > 0) {
    const { data: attempts } = await supabase
      .from('attempts')
      .select('question_id, mistake_type, created_at')
      .eq('user_id', me.id)
      .eq('correct', false)
      .in('question_id', rows.map((r) => r.question_id))
      .order('created_at', { ascending: false });
    for (const a of attempts ?? []) if (!mistakeOf.has(a.question_id)) mistakeOf.set(a.question_id, a.mistake_type);
  }
  if (filter) rows = rows.filter((r) => mistakeOf.get(r.question_id) === filter);

  const chip = (href: string, label: string, active: boolean) => (
    <Link
      key={href}
      href={href}
      aria-current={active ? 'true' : undefined}
      className={`flex min-h-[44px] items-center rounded-full border-2 border-ink px-3 text-sm ${active ? 'bg-jelly text-on-pastel' : 'bg-surface'}`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <h1 className="text-xl">오답노트</h1>
      <nav aria-label="실수 유형" className="flex flex-wrap gap-2">
        {chip('/wrong', '전체', !filter)}
        {MISTAKE_TYPES.map((t) => chip(`/wrong?m=${t}`, MISTAKE_LABELS[t], filter === t))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          title={filter ? '이 유형으로 틀린 문제가 없어요' : '오답노트가 비어 있어요'}
          body="틀린 문제가 생기면 여기 모여요."
          action={<JellyLink href="/review">복습하러 가기</JellyLink>}
        />
      ) : (
        <>
          <form action={startReview.bind(null, 'wrong', null)}>
            <JellyButton type="submit" block>
              다시 풀기
            </JellyButton>
          </form>
          <ul className="flex flex-col gap-3">
            {rows.map((r) => {
              const mt = mistakeOf.get(r.question_id) as MistakeType | null | undefined;
              return (
                <li key={r.question_id}>
                  <StickerCard className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                      {r.overconfident ? <span className="rounded-full border-2 border-ink bg-peach px-2 text-on-pastel">확실했는데 틀림</span> : null}
                      {mt ? <span>{MISTAKE_LABELS[mt]}</span> : null}
                      <span>
                        {r.questions.decks.title} · {r.questions.concept}
                      </span>
                    </div>
                    <p>{r.questions.prompt}</p>
                  </StickerCard>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
