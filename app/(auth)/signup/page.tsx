import Link from 'next/link';
import { StickerCard } from '@/components/ui/StickerCard';
import { SignupForm } from './SignupForm';

export const metadata = { title: '가입 · 픽셀공부방' };

export default function SignupPage() {
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl">픽셀공부방 가입</h1>
        <p className="text-ink-soft">만 14세 이상 고등학생이 쓸 수 있어요.</p>
      </div>
      <StickerCard>
        <SignupForm />
      </StickerCard>
      <p className="text-center text-sm text-ink-soft">
        이미 계정이 있다면{' '}
        <Link href="/login" className="font-title text-base text-ink underline underline-offset-4">
          로그인
        </Link>
      </p>
    </>
  );
}
