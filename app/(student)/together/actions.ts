'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireProfile } from '@/lib/auth/requireRole';
import { groupErrorMessage, STICKERS } from '@/lib/groups/constants';
import { newCard } from '@/lib/srs/fsrs';

export type FormState = { error?: string } | null;
const uuid = z.string().uuid();

export async function createGroup(_: FormState, form: FormData): Promise<FormState> {
  await requireProfile();
  const name = z.string().trim().min(1, '그룹 이름을 적어 주세요').max(20, '20자까지예요').safeParse(form.get('name'));
  if (!name.success) return { error: name.error.issues[0]?.message };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_group', { p_name: name.data });
  if (error) return { error: groupErrorMessage(error.message) };
  redirect(`/together/group/${data}`);
}

export async function joinGroup(_: FormState, form: FormData): Promise<FormState> {
  await requireProfile();
  const code = z.string().trim().regex(/^[A-Za-z0-9]{6}$/, '초대 코드는 6자리예요').safeParse(form.get('code'));
  if (!code.success) return { error: code.error.issues[0]?.message };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('join_group', { p_code: code.data });
  if (error) return { error: groupErrorMessage(error.message) };
  redirect(`/together/group/${data}`);
}

export async function leaveGroup(groupId: string) {
  await requireProfile();
  if (!uuid.safeParse(groupId).success) return;
  const supabase = await createClient();
  await supabase.rpc('leave_group', { p_group_id: groupId });
  redirect('/together');
}

export async function shareDeck(groupId: string, _: FormState, form: FormData): Promise<FormState> {
  await requireProfile();
  const parsed = z
    .object({ deckId: uuid, shareMaterial: z.boolean(), allowMerge: z.boolean(), rights: z.boolean() })
    .safeParse({
      deckId: form.get('deckId'),
      shareMaterial: form.get('shareMaterial') === 'on',
      allowMerge: form.get('allowMerge') === 'on',
      rights: form.get('rights') === 'on',
    });
  if (!uuid.safeParse(groupId).success || !parsed.success) return { error: '공유할 단원을 골라 주세요' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('share_deck', {
    p_group_id: groupId,
    p_deck_id: parsed.data.deckId,
    p_share_material: parsed.data.shareMaterial,
    p_allow_merge: parsed.data.allowMerge,
    p_rights_confirmed: parsed.data.rights,
  });
  if (error) return { error: groupErrorMessage(error.message) };
  redirect(`/together/group/${groupId}`);
}

export async function unshareDeck(groupId: string, shareId: string) {
  await requireProfile();
  if (!uuid.safeParse(shareId).success) return;
  const supabase = await createClient();
  await supabase.rpc('unshare_deck', { p_share_id: shareId });
  redirect(`/together/group/${groupId}`);
}

/** 공유 단원을 내 단원으로 복사 (8.5) */
export async function importShare(shareId: string) {
  const me = await requireProfile();
  if (!uuid.safeParse(shareId).success) return;
  const { data, error } = await createAdminClient().rpc('import_shared_deck', {
    p_user_id: me.id,
    p_share_id: shareId,
    p_new_card: newCard(new Date()),
  });
  if (error) throw new Error(groupErrorMessage(error.message));
  redirect(`/study/${data}`);
}

/** 공유 세트 신고 (8.5 → 콘솔 검수 큐). 저작권 문제도 여기로. */
export async function reportShare(groupId: string, shareId: string, reason: 'copyright' | 'wrong_content') {
  const me = await requireProfile();
  if (!uuid.safeParse(shareId).success) return;
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('reports')
    .select('id')
    .eq('reporter_id', me.id)
    .eq('target_type', 'deck_share')
    .eq('target_id', shareId)
    .maybeSingle();
  if (!existing) {
    await supabase.from('reports').insert({ reporter_id: me.id, target_type: 'deck_share', target_id: shareId, reason });
  }
  revalidatePath(`/together/group/${groupId}/shares/${shareId}`);
}

export async function pokeMember(groupId: string, userId: string) {
  await requireProfile();
  if (!uuid.safeParse(groupId).success || !uuid.safeParse(userId).success) return;
  const supabase = await createClient();
  await supabase.rpc('poke_member', { p_group_id: groupId, p_to: userId });
  revalidatePath(`/together/group/${groupId}`);
}

export async function reactEvent(groupId: string, eventId: number, sticker: string) {
  await requireProfile();
  if (!(sticker in STICKERS)) return;
  const supabase = await createClient();
  await supabase.rpc('react_group_event', { p_event_id: eventId, p_sticker: sticker });
  revalidatePath(`/together/group/${groupId}`);
}

export async function startRescue(groupId: string) {
  await requireProfile();
  if (!uuid.safeParse(groupId).success) return;
  const supabase = await createClient();
  const { data } = await supabase.rpc('start_rescue_session', { p_group_id: groupId });
  redirect(data ? `/review?s=${data}` : `/together/group/${groupId}?rescue=none`);
}
