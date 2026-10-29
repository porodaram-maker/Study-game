import { StickerCard } from '@/components/ui/StickerCard';
import { OnboardingForm } from './OnboardingForm';

export const metadata = { title: '첫 설정 · 픽셀공부방' };

export default function OnboardingPage() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl">반가워요!</h1>
        <p className="text-ink-soft">친구에게 보일 닉네임과 학년을 알려 주세요.</p>
      </div>
      <StickerCard>
        <OnboardingForm />
      </StickerCard>
    </>
  );
}
