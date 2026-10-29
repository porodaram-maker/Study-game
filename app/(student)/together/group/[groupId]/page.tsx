import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireProfile } from '@/lib/auth/requireRole';
import { STICKERS, type Sticker } from '@/lib/groups/constants';
import { StickerCard } from '@/components/ui/StickerCard';
import { JellyButton, JellyLink } from '@/components/ui/JellyButton';
import { ProgressCapsule } from '@/components/ui/ProgressCapsule';
import { FormMessage } from '@/components/ui/FormMessage';
import { leaveGroup, pokeMember, reactEvent, startRescue } from '../../actions';

export const metadata = { title: '스터디 그룹 · 픽셀공부방' };

type Member = { user_id: string; nickname: string; role: string; done_today: boolean | null; is_me: boolean };
type GroupEvent = { id: number; actor_id: string | null; kind: string; payload: Record<string, string | number>; created_at: string };

function eventText(e: GroupEvent, name: (id: string | null) => string): string {
  const who = name(e.actor_id);
  switch (e.kind) {
    case 'member.joined':
      return `${who}님이 그룹에 들어왔어요`;
    case 'deck.shared':
      return `${who}님이 '${e.payload.title}' 단원을 공유했어요`;
    case 'note.created':
      return `${who}님이 통합 노트 '${e.payload.title}'를 만들었어요`;
    case 'goal.completed':
      return `이번 주 목표 ${e.payload.target}문제를 다 같이 달성했어요!`;
    case 'boss.defeated':
      return `${e.payload.name}을(를) 쓰러뜨렸어요! ${who}님의 마지막 일격`;
    case 'rescue.saved':
      return `${who}님이 '${e.payload.concept}' 문제를 구했어요`;
    case 'streak.up':
      return `모두 복습을 끝내서 그룹 불꽃이 ${e.payload.streak}일이 됐어요`;
    case 'poke':
      return `${who}님이 ${e.payload.to_nickname}님을 콕 찔렀어요. 오늘 복습 같이 해요!`;
    default:
      return '';
  }
}

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ rescue?: string }>;
}) {
  const me = await requireProfile();
  const { groupId } = await params;
  const { rescue } = await searchParams;
  const supabase = await createClient();

  const { data: group } = await supabase
    .from('study_groups')
    .select('id, name, invite_code, owner_id, streak_count')
    .eq('id', groupId)
    .maybeSingle();
  if (!group) notFound();

  // 이번 주 목표·보스가 없으면 만든다 (첫 정답 전에도 보이게)
  await createAdminClient().rpc('ensure_group_week', { p_group_id: groupId });
  const { data: week } = await supabase.rpc('week_start');
  const { data: today } = await supabase.rpc('app_day');

  const [{ data: members }, { data: goal }, { data: boss }, { data: shares }, { data: notes }, { data: events }, { data: rescueRows }, { data: myPokes }] =
    await Promise.all([
      supabase.rpc('group_member_list', { p_group_id: groupId }),
      supabase.from('group_goals').select('id, target, progress, completed_at, group_goal_contributions(user_id)').eq('group_id', groupId).eq('week_start', week as string).maybeSingle(),
      supabase.from('group_bosses').select('id, name, hp, max_hp, defeated_at, group_boss_hits(user_id)').eq('group_id', groupId).eq('week_start', week as string).maybeSingle(),
      supabase.from('deck_shares').select('id, shared_by, share_material, allow_merge, decks!inner(title, subject)').eq('group_id', groupId).order('created_at', { ascending: false }),
      supabase.from('group_notes').select('id, title, subject, created_at').eq('group_id', groupId).order('created_at', { ascending: false }).limit(10),
      supabase.from('group_events').select('id, actor_id, kind, payload, created_at, group_reactions(user_id, sticker)').eq('group_id', groupId).order('created_at', { ascending: false }).limit(20),
      supabase.rpc('group_rescue_origins', { p_group_id: groupId }),
      supabase.from('group_pokes').select('to_id').eq('group_id', groupId).eq('from_id', me.id).eq('day', today as string),
    ]);

  const list = (members ?? []) as Member[];
  const nameOf = (id: string | null) => list.find((m) => m.user_id === id)?.nickname ?? '누군가';
  const contributors = new Set([
    ...((goal?.group_goal_contributions ?? []) as { user_id: string }[]).map((c) => c.user_id),
    ...((boss?.group_boss_hits ?? []) as { user_id: string }[]).map((c) => c.user_id),
  ]);
  const poked = new Set((myPokes ?? []).map((p) => p.to_id));
  const meDone = list.find((m) => m.is_me)?.done_today;

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href="/together" className="text-sm text-ink-soft">
          ← 같이
        </Link>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-xl">{group.name}</h1>
          <span className="shrink-0 text-sm text-ink-soft">
            초대 코드 <span className="font-pixel text-base text-ink">{group.invite_code}</span>
          </span>
        </div>
      </div>

      {/* 그룹 스트릭 불꽃 (8.6). 불꽃 스프라이트는 4단계 EffectPlayer로 교체 */}
      <StickerCard className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="font-title text-base">그룹 불꽃</span>
          <span className="text-xs text-ink-soft">모두 복습을 끝낸 날마다 +1</span>
        </div>
        <span className="font-pixel text-2xl">{group.streak_count}</span>
      </StickerCard>

      <section className="flex flex-col gap-2" aria-label="그룹원">
        <h2 className="text-lg">그룹원</h2>
        <ul className="flex flex-col gap-2">
          {list.map((m) => (
            <li key={m.user_id} className="flex min-h-[44px] items-center justify-between gap-2 rounded-jelly border-2 border-ink bg-surface px-3">
              <span className="flex items-center gap-2">
                <span className="font-title">{m.nickname}</span>
                {m.role === 'owner' ? <span className="text-xs text-ink-soft">그룹장</span> : null}
                {contributors.has(m.user_id) ? (
                  <span className="rounded-full border-2 border-ink bg-pink px-2 text-xs text-on-pastel">응원 마크</span>
                ) : null}
              </span>
              {m.done_today === true ? (
                <span className="text-sm">
                  <span aria-hidden>○ </span>오늘 완료
                </span>
              ) : m.done_today === false && !m.is_me ? (
                poked.has(m.user_id) ? (
                  <span className="text-sm text-ink-soft">콕 찔렀어요</span>
                ) : (
                  <form action={pokeMember.bind(null, groupId, m.user_id)}>
                    <JellyButton type="submit" size="sm" variant="plain">
                      콕 찌르기
                    </JellyButton>
                  </form>
                )
              ) : null}
            </li>
          ))}
        </ul>
        {meDone === false ? (
          <JellyLink href="/review" block>
            내 복습 하러 가기
          </JellyLink>
        ) : null}
      </section>

      {goal ? (
        <StickerCard className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg">이번 주 목표</h2>
            <span className="font-pixel text-sm">
              {goal.progress}/{goal.target}
            </span>
          </div>
          <ProgressCapsule value={goal.progress / goal.target} tone="mint" label="주간 목표 진행" />
          <p className="text-xs text-ink-soft">{goal.completed_at ? '달성! 모두 별조각을 받았어요.' : '각자 맞힌 문제가 더해져요.'}</p>
        </StickerCard>
      ) : null}

      {boss ? (
        <StickerCard className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg">{boss.name}</h2>
            <span className="font-pixel text-sm">
              HP {boss.hp}/{boss.max_hp}
            </span>
          </div>
          {/* 보스 스프라이트 자리 (4·5단계) */}
          <ProgressCapsule value={boss.hp / boss.max_hp} tone="pink" label="보스 HP" />
          <p className="text-xs text-ink-soft">
            {boss.defeated_at ? '쓰러뜨렸어요! 다음 주 월요일에 새 보스가 나와요.' : '정답 1, 오답 교정 3, 확실했는데 틀린 문제 교정 5만큼 깎여요.'}
          </p>
        </StickerCard>
      ) : null}

      <StickerCard className="flex flex-col gap-2">
        <h2 className="text-lg">오답 구조대</h2>
        <p className="text-sm text-ink-soft">
          그룹원 여럿이 틀린 공유 문제 <span className="font-pixel text-ink">{(rescueRows ?? []).length}</span>개
        </p>
        {rescue === 'none' ? <FormMessage tone="info">내 오답노트에는 같이 잡을 문제가 없어요. 공유 단원을 가져와 풀어 보세요.</FormMessage> : null}
        <form action={startRescue.bind(null, groupId)}>
          <JellyButton type="submit" variant="butter" block disabled={(rescueRows ?? []).length === 0}>
            구조 세트 풀기
          </JellyButton>
        </form>
      </StickerCard>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg">공유 단원</h2>
          <Link href={`/together/group/${groupId}/share`} className="flex min-h-[44px] items-center font-title text-base text-ink-soft">
            내 단원 공유
          </Link>
        </div>
        {(shares ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">아직 공유된 단원이 없어요.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(shares ?? []).map((s) => {
              const d = s.decks as unknown as { title: string; subject: string };
              return (
                <li key={s.id}>
                  <Link href={`/together/group/${groupId}/shares/${s.id}`} className="block rounded-sticker">
                    <StickerCard className="flex flex-col gap-1">
                      <span className="font-title text-base">{d.title}</span>
                      <span className="text-xs text-ink-soft">
                        {d.subject} · {nameOf(s.shared_by)} · {s.share_material ? '원문 공개' : '문제만'}
                      </span>
                    </StickerCard>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg">통합 노트</h2>
          <Link href={`/together/group/${groupId}/notes/new`} className="flex min-h-[44px] items-center font-title text-base text-ink-soft">
            새 통합 노트
          </Link>
        </div>
        {(notes ?? []).length === 0 ? (
          <p className="text-sm text-ink-soft">반마다 다른 필기를 하나로 합쳐 보세요.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {(notes ?? []).map((n) => (
              <li key={n.id}>
                <Link href={`/together/group/${groupId}/notes/${n.id}`} className="block rounded-sticker">
                  <StickerCard className="flex items-baseline justify-between gap-2">
                    <span className="font-title text-base">{n.title}</span>
                    <span className="text-xs text-ink-soft">{n.subject}</span>
                  </StickerCard>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-label="그룹 소식">
        <h2 className="text-lg">그룹 소식</h2>
        <ul className="flex flex-col gap-2">
          {((events ?? []) as (GroupEvent & { group_reactions: { user_id: string; sticker: Sticker }[] })[]).map((e) => {
            const mine = e.group_reactions.find((r) => r.user_id === me.id)?.sticker;
            return (
              <li key={e.id} className="flex flex-col gap-2 rounded-jelly border-2 border-ink bg-surface p-3">
                <p className="text-sm">{eventText(e, nameOf)}</p>
                <div className="flex flex-wrap gap-1">
                  {(Object.keys(STICKERS) as Sticker[]).map((k) => {
                    const count = e.group_reactions.filter((r) => r.sticker === k).length;
                    return (
                      <form key={k} action={reactEvent.bind(null, groupId, e.id, k)}>
                        <button
                          type="submit"
                          aria-pressed={mine === k}
                          className={`min-h-[44px] rounded-full border-2 border-ink px-3 text-xs ${mine === k ? 'bg-jelly text-on-pastel' : 'bg-surface'}`}
                        >
                          {STICKERS[k]}
                          {count ? <span className="ml-1 font-pixel">{count}</span> : null}
                        </button>
                      </form>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <form action={leaveGroup.bind(null, groupId)}>
        <JellyButton type="submit" variant="plain" size="sm" block>
          그룹 나가기
        </JellyButton>
      </form>
    </>
  );
}
