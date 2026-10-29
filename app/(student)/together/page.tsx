import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth/requireRole';
import { StickerCard } from '@/components/ui/StickerCard';
import { CreateGroupForm, JoinGroupForm } from './GroupForms';

export const metadata = { title: '같이 · 픽셀공부방' };

export default async function TogetherPage() {
  const me = await requireProfile();
  const supabase = await createClient();
  const { data: groups } = await supabase
    .from('group_members')
    .select('study_groups!inner(id, name, streak_count, group_members(count))')
    .eq('user_id', me.id)
    .order('joined_at');

  return (
    <>
      <h1 className="text-xl">같이</h1>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg">내 스터디 그룹</h2>
        {(groups ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">그룹을 만들거나 친구에게 받은 초대 코드로 참가해 보세요.</p>
        ) : (
          (groups ?? []).map((row) => {
            const g = row.study_groups as unknown as { id: string; name: string; streak_count: number; group_members: { count: number }[] };
            return (
              <Link key={g.id} href={`/together/group/${g.id}`} className="block rounded-sticker">
                <StickerCard className="flex items-center justify-between gap-3">
                  <span className="font-title text-lg">{g.name}</span>
                  <span className="flex shrink-0 items-center gap-3 text-sm text-ink-soft">
                    <span>
                      <span className="font-pixel">{g.group_members[0]?.count ?? 1}</span>명
                    </span>
                    <span>
                      불꽃 <span className="font-pixel text-ink">{g.streak_count}</span>
                    </span>
                  </span>
                </StickerCard>
              </Link>
            );
          })
        )}
      </section>
      <StickerCard>
        <JoinGroupForm />
      </StickerCard>
      <StickerCard>
        <CreateGroupForm />
      </StickerCard>
      <p className="text-center text-sm text-ink-soft">같이 공부방과 친구 대결은 곧 열려요.</p>
    </>
  );
}
