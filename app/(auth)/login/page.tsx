import Link from 'next/link';
import { StickerCard } from '@/components/ui/StickerCard';
import { LoginForm } from './LoginForm';

export const metadata = { title: '로그인 · 픽셀공부방' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <>
      <h1 className="text-2xl">다시 왔군요!</h1>
      <StickerCard>
        <LoginForm next={next} linkError={error === 'link'} />
      </StickerCard>
      <p className="text-center text-sm text-ink-soft">
        처음이라면{' '}
        <Link href="/signup" className="font-title text-base text-ink underline underline-offset-4">
          가입하기
        </Link>
      </p>
    </>
  );
}
