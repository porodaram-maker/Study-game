import { BottomTabs } from '@/components/ui/BottomTabs';
import { requireProfile } from '@/lib/auth/requireRole';

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  await requireProfile();
  return (
    <>
      <main className="mx-auto flex min-h-dvh max-w-student flex-col gap-6 px-4 pb-28 pt-6">{children}</main>
      <BottomTabs />
    </>
  );
}
