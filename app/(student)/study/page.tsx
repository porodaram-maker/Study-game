import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth/requireRole';
import { progressByDeck } from '@/lib/study/progress';
import { EmptyState } from '@/components/ui/EmptyState';
import { JellyLink } from '@/components/ui/JellyButton';
import { StickerCard } from '@/components/ui/StickerCard';
import { ProgressCapsule } from '@/components/ui/ProgressCapsule';

export const metadata = { title: '공부 · 픽셀공부방' };

export default async function StudyPage() {
  const me = await requireProfile();
  const supabase = await createClient();
  const { data: decks } = await supabase
    .from('decks')
    .select('id, subject, title, mode')
    .eq('owner_id', me.id)
    .order('created_at', { ascending: false });
  const progress = await progressByDeck(me.id, (decks ?? []).map((d) => d.id));

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl">공부</h1>
        <Link href="/wrong" className="flex min-h-[44px] items-center font-title text-base text-ink-soft">
          오답노트
        </Link>
      </div>
      <JellyLink href="/study/new" block>
        자료 올리기
      </JellyLink>
      {!decks || decks.length === 0 ? (
        <EmptyState title="아직 단원이 없어요" body="교과서, 프린트, 필기를 붙여 넣으면 문제를 만들어 줘요." />
      ) : (
        <ul className="flex flex-col gap-3">
          {decks.map((d) => {
            const p = progress.get(d.id) ?? 0;
            return (
              <li key={d.id}>
                <Link href={`/study/${d.id}`} className="block rounded-sticker">
                  <StickerCard className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-title text-lg">{d.title}</span>
                      <span className="shrink-0 text-xs text-ink-soft">
                        {d.subject} · {d.mode === 'naesin' ? '내신' : '수능'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <ProgressCapsule value={p} label={`${d.title} 기억 진행`} />
                      <span className="w-10 shrink-0 text-right font-pixel text-sm">{Math.round(p * 100)}%</span>
                    </div>
                  </StickerCard>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
