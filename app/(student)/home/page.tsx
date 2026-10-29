import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth/requireRole';
import { StickerCard } from '@/components/ui/StickerCard';
import { StatChip } from '@/components/ui/StatChip';
import { EmptyState } from '@/components/ui/EmptyState';

export const metadata = { title: '홈 · 픽셀공부방' };

export default async function HomePage() {
  const me = await requireProfile();
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('stars, streak_count, friend_code')
    .eq('id', me.id)
    .single();

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

      <EmptyState title="오늘의 복습이 아직 없어요" body="자료를 올리면 문제가 만들어지고 복습이 시작돼요." />

      <p className="text-center text-sm text-ink-soft">
        내 친구 코드 <span className="font-pixel text-base text-ink">{profile?.friend_code}</span>
      </p>
    </>
  );
}
