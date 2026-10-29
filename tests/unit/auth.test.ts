import { describe, expect, it } from 'vitest';
import { hasRole } from '@/lib/auth/roles';
import { decideRoute, safeNextPath } from '@/lib/auth/routes';
import { nicknameSchema, onboardingSchema, signupSchema } from '@/lib/auth/schemas';
import { profileErrorMessage } from '@/lib/auth/errors';

describe('hasRole', () => {
  it('어드민은 에디터 권한을 포함한다', () => {
    expect(hasRole('admin', 'editor')).toBe(true);
    expect(hasRole('editor', 'editor')).toBe(true);
    expect(hasRole('student', 'editor')).toBe(false);
    expect(hasRole('editor', 'admin')).toBe(false);
    expect(hasRole(null, 'student')).toBe(false);
  });
});

describe('decideRoute', () => {
  const base = { search: '', signedIn: true, hasProfile: true, role: 'student' as const };

  it('비로그인은 보호된 화면에서 /login으로, 돌아올 경로를 붙인다', () => {
    expect(decideRoute({ ...base, signedIn: false, hasProfile: false, role: null, pathname: '/home', search: '?a=1' })).toEqual({
      type: 'redirect',
      to: '/login?next=%2Fhome%3Fa%3D1',
    });
    expect(decideRoute({ ...base, signedIn: false, hasProfile: false, role: null, pathname: '/signup' })).toEqual({ type: 'next' });
  });

  it('프로필이 없으면 온보딩으로', () => {
    expect(decideRoute({ ...base, hasProfile: false, role: null, pathname: '/home' })).toEqual({ type: 'redirect', to: '/onboarding' });
    expect(decideRoute({ ...base, hasProfile: false, role: null, pathname: '/onboarding' })).toEqual({ type: 'next' });
    expect(decideRoute({ ...base, hasProfile: false, role: null, pathname: '/login' })).toEqual({ type: 'redirect', to: '/onboarding' });
  });

  it('온보딩을 마친 사용자는 로그인·온보딩 화면 대신 홈으로', () => {
    expect(decideRoute({ ...base, pathname: '/onboarding' })).toEqual({ type: 'redirect', to: '/home' });
    expect(decideRoute({ ...base, pathname: '/login' })).toEqual({ type: 'redirect', to: '/home' });
    expect(decideRoute({ ...base, pathname: '/' })).toEqual({ type: 'redirect', to: '/home' });
  });

  it('학생은 /console에 못 들어간다', () => {
    expect(decideRoute({ ...base, pathname: '/console/items' })).toEqual({ type: 'redirect', to: '/home' });
    expect(decideRoute({ ...base, role: 'editor', pathname: '/console/items' })).toEqual({ type: 'next' });
    expect(decideRoute({ ...base, pathname: '/consoles' })).toEqual({ type: 'next' });
  });
});

describe('safeNextPath', () => {
  it('외부 주소로 튕기지 않는다', () => {
    expect(safeNextPath('/study')).toBe('/study');
    expect(safeNextPath('https://evil.example')).toBe('/home');
    expect(safeNextPath('//evil.example')).toBe('/home');
    expect(safeNextPath('/\\evil.example')).toBe('/home');
    expect(safeNextPath(null)).toBe('/home');
  });
});

describe('schemas', () => {
  it('닉네임 규칙', () => {
    expect(nicknameSchema.safeParse('픽셀공부왕').success).toBe(true);
    expect(nicknameSchema.safeParse('  pixel_1  ').data).toBe('pixel_1');
    expect(nicknameSchema.safeParse('a').success).toBe(false);
    expect(nicknameSchema.safeParse('열세글자가넘는아주긴닉네임').success).toBe(false);
    expect(nicknameSchema.safeParse('이모지😀').success).toBe(false);
  });

  it('가입은 만 14세 확인과 약관 동의가 필수', () => {
    const ok = { email: 'a@b.co', password: '12345678', age14: true, terms: true };
    expect(signupSchema.safeParse(ok).success).toBe(true);
    expect(signupSchema.safeParse({ ...ok, age14: false }).success).toBe(false);
    expect(signupSchema.safeParse({ ...ok, terms: false }).success).toBe(false);
    expect(signupSchema.safeParse({ ...ok, password: 'short' }).success).toBe(false);
  });

  it('온보딩 학년은 1~3', () => {
    expect(onboardingSchema.safeParse({ nickname: '학생', grade: '2' }).data?.grade).toBe(2);
    expect(onboardingSchema.safeParse({ nickname: '학생', grade: 4 }).success).toBe(false);
  });

  it('DB 오류를 화면 문구로 바꾼다', () => {
    expect(profileErrorMessage('nickname_taken')).toBe('이미 누가 쓰고 있는 닉네임이에요');
    expect(profileErrorMessage('???')).toBe('잠시 후 다시 시도해 주세요');
  });
});
