import { EmptyState } from '@/components/ui/EmptyState';

export const metadata = { title: '공부 · 픽셀공부방' };

export default function Page() {
  return (
    <>
      <h1 className="text-xl">공부</h1>
      <EmptyState title="준비 중이에요" body="단원과 자료 올리기가 곧 열려요" />
    </>
  );
}
