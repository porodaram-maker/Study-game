import { EmptyState } from '@/components/ui/EmptyState';

export const metadata = { title: '친구 · 픽셀공부방' };

export default function Page() {
  return (
    <>
      <h1 className="text-xl">친구</h1>
      <EmptyState title="준비 중이에요" body="친구 코드로 친구를 맺는 기능이 곧 열려요" />
    </>
  );
}
