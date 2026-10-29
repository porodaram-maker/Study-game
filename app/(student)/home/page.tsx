import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth/requireRole';
import { StickerCard } from '@/components/ui/StickerCard';
import { StatChip } from '@/components/ui/StatChip';
import { EmptyState } from '@/components/ui/EmptyState';
import { JellyLink } from '@/components/ui/JellyButton';

export const metadata = { title: '홈 · 픽셀공부방' };

export default async function HomePage() {
  const me = await requireProfile();
  const supabase = await createClient();
  const [{ data: profile }, { count: due }, { count: decks }] = await Promise.all([
    supabase.from('profiles').select('stars, streak_count, friend_code').eq('id', me.id).single(),
    supabase.from('card_states').select('question_id', { count: 'exact', head: true }).eq('user_id', me.id).lte('due', new Date().toISOString()),
    supabase.from('decks').select('id', { count: 'exact', head: true }).eq('owner_id', me.id),
  ]);

  return (
    <>
      <header className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <StatChip label="스트릭" value={profile?.streak_count ?? 0} tone="peach" />
          <StatChip label="별조각" value={profile?.stars ?? 0} tone="butter" />
        </div>
        <Link href="/me" className="flex min-h-[44px] items-center font-title text-base text-ink-soft">
          설정
        </Link>
      </header>

      {/* 방 장면(아바타·펫)이 들어갈 자리. 4단계 RoomRenderer가 320×180 정수 배율로 채운다. */}
      <StickerCard className="flex aspect-[16/9] items-end p-4">
        <p className="font-title text-lg">{me.nickname}의 방</p>
      </StickerCard>

      {due ? (
        <StickerCard className="flex flex-col gap-3">
          <p>
            오늘 복습할 문제 <span className="font-pixel text-lg">{due}</span>개
          </p>
          <JellyLink href="/review" block>
            오늘의 복습
          </JellyLink>
        </StickerCard>
      ) : decks ? (
        <EmptyState title="오늘 복습은 다 했어요" body="새 자료를 올리거나 단원을 더 공부해 봐요." action={<JellyLink href="/study">공부하러 가기</JellyLink>} />
      ) : (
        <EmptyState
          title="오늘의 복습이 아직 없어요"
          body="자료를 올리면 문제가 만들어지고 복습이 시작돼요."
          action={<JellyLink href="/study/new">자료 올리기</JellyLink>}
        />
      )}

      <p className="text-center text-sm text-ink-soft">
        내 친구 코드 <span className="font-pixel text-base text-ink">{profile?.friend_code}</span>
      </p>
    </>
  );
}
