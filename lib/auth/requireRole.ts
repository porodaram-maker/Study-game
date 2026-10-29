import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { hasRole, isUserRole, type UserRole } from './roles';

export type SessionProfile = {
  id: string;
  nickname: string;
  role: UserRole;
};

/** 로그인과 프로필을 확인한다. 없으면 로그인 또는 온보딩으로 보낸다. */
export async function requireProfile(): Promise<SessionProfile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, nickname, role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || !isUserRole(profile.role)) redirect('/onboarding');

  return { id: profile.id, nickname: profile.nickname, role: profile.role };
}

/**
 * 서버 컴포넌트·서버 액션·Route Handler에서 역할을 확인한다.
 * 화면 가드(proxy)와 별개로 반드시 다시 부른다 (SPEC 12장 이중 확인).
 */
export async function requireRole(required: UserRole): Promise<SessionProfile> {
  const profile = await requireProfile();
  if (!hasRole(profile.role, required)) redirect('/home');
  return profile;
}
