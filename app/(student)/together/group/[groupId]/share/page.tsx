import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth/requireRole';
import { StickerCard } from '@/components/ui/StickerCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { JellyLink } from '@/components/ui/JellyButton';
import { ShareForm } from './ShareForm';

export const metadata = { title: '단원 공유 · 픽셀공부방' };

export default async function SharePage({ params }: { params: Promise<{ groupId: string }> }) {
  const me = await requireProfile();
  const { groupId } = await params;
  const supabase = await createClient();
  // 내가 직접 만든 단원만 공유할 수 있다 (가져온 복사본은 다시 공유하지 않는다)
  const { data: decks } = await supabase
    .from('decks')
    .select('id, title, subject')
    .eq('owner_id', me.id)
    .is('source_deck_id', null)
    .order('created_at', { ascending: false });

  return (
    <>
      <Link href={`/together/group/${groupId}`} className="text-sm text-ink-soft">
        ← 그룹으로
      </Link>
      <h1 className="text-xl">내 단원 공유</h1>
      {(decks ?? []).length === 0 ? (
        <EmptyState title="공유할 단원이 없어요" body="자료를 올려 단원을 먼저 만들어 주세요." action={<JellyLink href="/study/new">자료 올리기</JellyLink>} />
      ) : (
        <StickerCard>
          <ShareForm groupId={groupId} decks={decks ?? []} />
        </StickerCard>
      )}
    </>
  );
}
