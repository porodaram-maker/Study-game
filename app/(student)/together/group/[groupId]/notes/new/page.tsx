import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth/requireRole';
import { mergeCountToday } from '@/lib/ai/limits';
import { StickerCard } from '@/components/ui/StickerCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { MergeForm } from './MergeForm';

export const metadata = { title: '통합 노트 만들기 · 픽셀공부방' };

type Member = { user_id: string; nickname: string };

export default async function NewNotePage({ params }: { params: Promise<{ groupId: string }> }) {
  const me = await requireProfile();
  const { groupId } = await params;
  const supabase = await createClient();
  const [{ data: shares }, { data: members }, { used, limit }] = await Promise.all([
    supabase.from('deck_shares').select('id, shared_by, decks!inner(title, subject)').eq('group_id', groupId).eq('allow_merge', true).order('created_at', { ascending: false }),
    supabase.rpc('group_member_list', { p_group_id: groupId }),
    mergeCountToday(me.id),
  ]);
  const nameOf = new Map(((members ?? []) as Member[]).map((m) => [m.user_id, m.nickname]));
  const sources = (shares ?? []).map((s) => {
    const d = s.decks as unknown as { title: string; subject: string };
    return { id: s.id as string, title: d.title, subject: d.subject, owner: nameOf.get(s.shared_by) ?? '그룹원' };
  });

  return (
    <>
      <Link href={`/together/group/${groupId}`} className="text-sm text-ink-soft">
        ← 그룹으로
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-xl">통합 노트 만들기</h1>
        <p className="text-sm text-ink-soft">반마다 다른 필기를 모아 빠진 내용 없이 하나로 정리해요. 자료마다 설명이 다르면 따로 표시해요.</p>
      </div>
      {sources.length < 2 ? (
        <EmptyState title="합칠 자료가 부족해요" body="그룹원 2명 이상이 같은 단원을 공유하면 만들 수 있어요." />
      ) : (
        <StickerCard>
          <MergeForm groupId={groupId} sources={sources} remaining={Math.max(0, limit - used)} />
        </StickerCard>
      )}
    </>
  );
}
