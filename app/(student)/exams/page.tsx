import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth/requireRole';
import { configNumber } from '@/lib/game/config';
import { daysUntil } from '@/lib/game/level';
import { StickerCard } from '@/components/ui/StickerCard';
import { JellyButton } from '@/components/ui/JellyButton';
import { FormMessage } from '@/components/ui/FormMessage';
import { ExamForm } from './ExamForm';
import { deleteExam, startExamReview } from './actions';

export const metadata = { title: '시험 계획 · 픽셀공부방' };

export default async function ExamsPage({ searchParams }: { searchParams: Promise<{ used?: string; empty?: string }> }) {
  const me = await requireProfile();
  const { used, empty } = await searchParams;
  const supabase = await createClient();
  const [{ data: exams }, { data: decks }, { data: today }, boostDays] = await Promise.all([
    supabase.from('exams').select('id, name, exam_date, decks(id, title)').eq('user_id', me.id).order('exam_date'),
    supabase.from('decks').select('id, title, subject').eq('owner_id', me.id).order('created_at', { ascending: false }),
    supabase.rpc('app_day'),
    configNumber('exam.boost_days'),
  ]);

  return (
    <>
      <h1 className="text-xl">시험 계획</h1>
      {used ? <FormMessage tone="info">오늘 시험 대비 세트는 이미 풀었어요. 내일 또 열려요.</FormMessage> : null}
      {empty ? <FormMessage tone="info">시험 범위 단원에 문제가 없어요. 단원을 연결해 주세요.</FormMessage> : null}

      {(exams ?? []).map((e) => {
        const left = daysUntil(e.exam_date, today as string);
        const scope = (e.decks ?? []) as { id: string; title: string }[];
        return (
          <StickerCard key={e.id} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-title text-lg">{e.name}</span>
              <span className="font-pixel text-lg">{left === 0 ? 'D-DAY' : left > 0 ? `D-${left}` : '끝'}</span>
            </div>
            <p className="text-sm text-ink-soft">{scope.length ? scope.map((d) => d.title).join(', ') : '범위 단원 없음'}</p>
            {left >= 0 && left <= boostDays && scope.length > 0 ? (
              <form action={startExamReview.bind(null, e.id)}>
                <JellyButton type="submit" variant="butter" block>
                  시험 대비 세트 풀기
                </JellyButton>
              </form>
            ) : null}
            <form action={deleteExam.bind(null, e.id)} className="self-end">
              <JellyButton type="submit" size="sm" variant="plain">
                삭제
              </JellyButton>
            </form>
          </StickerCard>
        );
      })}

      <StickerCard>
        <ExamForm decks={decks ?? []} />
      </StickerCard>
    </>
  );
}
