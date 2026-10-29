import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth/requireRole';
import { StickerCard } from '@/components/ui/StickerCard';
import { JellyButton } from '@/components/ui/JellyButton';
import { importShare, reportShare, unshareDeck } from '../../../../actions';

export const metadata = { title: '공유 단원 · 픽셀공부방' };

export default async function SharedDeckPage({ params }: { params: Promise<{ groupId: string; shareId: string }> }) {
  const me = await requireProfile();
  const { groupId, shareId } = await params;
  const supabase = await createClient();

  const { data: share } = await supabase
    .from('deck_shares')
    .select('id, deck_id, shared_by, share_material, decks!inner(title, subject)')
    .eq('id', shareId)
    .eq('group_id', groupId)
    .maybeSingle();
  if (!share) notFound();
  const deck = share.decks as unknown as { title: string; subject: string };

  const [{ data: questions }, { data: materials }, { data: group }, { data: imported }, { data: reported }] = await Promise.all([
    supabase.from('questions').select('id, concept, prompt').eq('deck_id', share.deck_id).order('id'),
    share.share_material ? supabase.from('materials').select('extracted_text').eq('deck_id', share.deck_id) : Promise.resolve({ data: [] }),
    supabase.from('study_groups').select('owner_id').eq('id', groupId).single(),
    supabase.from('decks').select('id').eq('owner_id', me.id).eq('source_deck_id', share.deck_id).maybeSingle(),
    supabase.from('reports').select('id').eq('reporter_id', me.id).eq('target_type', 'deck_share').eq('target_id', shareId).maybeSingle(),
  ]);
  const mine = share.shared_by === me.id;
  const canUnshare = mine || group?.owner_id === me.id;

  return (
    <>
      <Link href={`/together/group/${groupId}`} className="text-sm text-ink-soft">
        ← 그룹으로
      </Link>
      <div className="flex flex-col gap-1">
        <span className="text-sm text-ink-soft">{deck.subject}</span>
        <h1 className="text-xl">{deck.title}</h1>
      </div>

      {!mine ? (
        imported ? (
          <Link href={`/study/${imported.id}`} className="font-title text-base underline underline-offset-4">
            내 단원에서 보기
          </Link>
        ) : (
          <form action={importShare.bind(null, shareId)}>
            <JellyButton type="submit" block>
              내 단원으로 가져오기
            </JellyButton>
          </form>
        )
      ) : null}

      {share.share_material && (materials ?? []).length > 0 ? (
        <StickerCard className="flex flex-col gap-2">
          <h2 className="text-lg">원문</h2>
          <p className="max-h-80 overflow-y-auto whitespace-pre-wrap text-sm">{(materials ?? []).map((m) => m.extracted_text).join('\n\n')}</p>
        </StickerCard>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg">
          문제 <span className="font-pixel">{(questions ?? []).length}</span>개
        </h2>
        <ul className="flex flex-col gap-2">
          {(questions ?? []).map((q) => (
            <li key={q.id} className="rounded-jelly border-2 border-ink bg-surface p-3 text-sm">
              <span className="text-xs text-ink-soft">{q.concept}</span>
              <p>{q.prompt}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-col gap-2">
        {canUnshare ? (
          <form action={unshareDeck.bind(null, groupId, shareId)}>
            <JellyButton type="submit" variant="plain" size="sm" block>
              공유 멈추기
            </JellyButton>
          </form>
        ) : null}
        {!mine ? (
          reported ? (
            <p className="text-center text-sm text-ink-soft">신고했어요. 검토 후 처리돼요.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <form action={reportShare.bind(null, groupId, shareId, 'copyright')}>
                <JellyButton type="submit" variant="plain" size="sm" block>
                  저작권 신고
                </JellyButton>
              </form>
              <form action={reportShare.bind(null, groupId, shareId, 'wrong_content')}>
                <JellyButton type="submit" variant="plain" size="sm" block>
                  내용 오류 신고
                </JellyButton>
              </form>
            </div>
          )
        ) : null}
      </div>
    </>
  );
}
