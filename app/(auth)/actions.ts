'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { authErrorMessage, profileErrorMessage } from '@/lib/auth/errors';
import { safeNextPath } from '@/lib/auth/routes';
import {
  loginSchema,
  onboardingSchema,
  signupSchema,
  type ActionResult,
  type LoginInput,
  type OnboardingInput,
  type SignupInput,
} from '@/lib/auth/schemas';

// 모든 입력은 클라이언트 검증과 별개로 서버에서 zod로 다시 검증한다 (SPEC 2장).

export async function login(input: LoginInput, next?: string): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력을 확인해 주세요' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: authErrorMessage(error.code) };

  redirect(safeNextPath(next));
}

export async function signup(input: SignupInput): Promise<ActionResult> {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력을 확인해 주세요' };

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // create_profile이 이 값을 다시 확인한다
      data: { age_14_plus: true },
      emailRedirectTo: `${siteUrl}/auth/callback?next=/onboarding`,
    },
  });
  if (error) return { ok: false, error: authErrorMessage(error.code) };

  // 이메일 인증을 끈 프로젝트면 바로 세션이 생긴다
  if (data.session) redirect('/onboarding');
  return { ok: true, message: '메일함에서 인증 링크를 눌러 주세요. 그다음 첫 설정을 시작해요.' };
}

export async function completeOnboarding(input: OnboardingInput): Promise<ActionResult> {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? '입력을 확인해 주세요' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('create_profile', {
    p_nickname: parsed.data.nickname,
    p_grade: parsed.data.grade,
  });
  if (error) return { ok: false, error: profileErrorMessage(error.message) };

  redirect('/home');
}
