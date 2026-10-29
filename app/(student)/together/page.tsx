import { EmptyState } from '@/components/ui/EmptyState';

export const metadata = { title: '같이 · 픽셀공부방' };

export default function Page() {
  return (
    <>
      <h1 className="text-xl">같이</h1>
      <EmptyState title="준비 중이에요" body="같이 공부방과 대결이 곧 열려요" />
    </>
  );
}
