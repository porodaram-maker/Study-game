import { requireProfile } from '@/lib/auth/requireRole';
import { generateCountToday } from '@/lib/ai/limits';
import { StickerCard } from '@/components/ui/StickerCard';
import { GenerateForm } from './GenerateForm';

export const metadata = { title: '자료 올리기 · 픽셀공부방' };

export default async function NewMaterialPage() {
  const me = await requireProfile();
  const { used, limit } = await generateCountToday(me.id);
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-xl">자료 올리기</h1>
        <p className="text-sm text-ink-soft">붙여 넣은 자료로 문제 8~15개를 만들어요. 자료는 나만 볼 수 있어요.</p>
      </div>
      <StickerCard>
        <GenerateForm remaining={Math.max(0, limit - used)} />
      </StickerCard>
    </>
  );
}
