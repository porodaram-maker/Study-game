import { JellyLink } from '@/components/ui/JellyButton';

// 비로그인 첫 화면. 로그인한 사용자는 proxy가 /home 또는 /onboarding으로 보낸다.
export default function Landing() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-student flex-col justify-center gap-6 px-4 py-12">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl">픽셀공부방</h1>
        <p className="text-ink-soft">하루 10분 복습하고, 맞힌 만큼 별조각을 모아 내 픽셀 방을 꾸며요.</p>
      </div>
      <div className="flex flex-col gap-3">
        <JellyLink href="/signup" block>
          가입하기
        </JellyLink>
        <JellyLink href="/login" variant="plain" block>
          로그인
        </JellyLink>
      </div>
    </main>
  );
}
