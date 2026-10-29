import { EmptyState } from '@/components/ui/EmptyState';

export const metadata = { title: '내 방 · 픽셀공부방' };

export default function Page() {
  return (
    <>
      <h1 className="text-xl">내 방</h1>
      <EmptyState title="준비 중이에요" body="방 꾸미기가 곧 열려요" />
    </>
  );
}
