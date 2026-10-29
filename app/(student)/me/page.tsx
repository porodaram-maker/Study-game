import { requireProfile } from '@/lib/auth/requireRole';
import { StickerCard } from '@/components/ui/StickerCard';
import { JellyButton } from '@/components/ui/JellyButton';

export const metadata = { title: '설정 · 픽셀공부방' };

export default async function MePage() {
  const me = await requireProfile();
  return (
    <>
      <h1 className="text-xl">설정</h1>
      <StickerCard className="flex flex-col gap-1">
        <span className="text-sm text-ink-soft">닉네임</span>
        <span className="font-title text-lg">{me.nickname}</span>
      </StickerCard>
      <form action="/auth/signout" method="post">
        <JellyButton type="submit" variant="plain" block>
          로그아웃
        </JellyButton>
      </form>
    </>
  );
}
