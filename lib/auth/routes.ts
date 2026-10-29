import { hasRole, type UserRole } from './roles';

export type RouteDecision =
  | { type: 'next' }
  | { type: 'redirect'; to: string };

const PUBLIC_PREFIXES = ['/login', '/signup', '/auth', '/invite', '/legal'];
const GUEST_ONLY = ['/login', '/signup'];

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * proxy에서 쓰는 라우팅 규칙. 화면 가드일 뿐이고 실제 권한은 RLS와 서버 함수가 다시 확인한다.
 * - 로그인 안 함: 공개 경로 외에는 /login
 * - 로그인 했지만 프로필 없음: /onboarding
 * - /console: 에디터 이상
 */
export function decideRoute(input: {
  pathname: string;
  search?: string;
  signedIn: boolean;
  hasProfile: boolean;
  role: UserRole | null;
}): RouteDecision {
  const { pathname, signedIn, hasProfile, role } = input;
  const isPublic = pathname === '/' || PUBLIC_PREFIXES.some((p) => matches(pathname, p));

  if (!signedIn) {
    if (isPublic) return { type: 'next' };
    const next = encodeURIComponent(pathname + (input.search ?? ''));
    return { type: 'redirect', to: `/login?next=${next}` };
  }

  if (GUEST_ONLY.some((p) => matches(pathname, p)) || pathname === '/') {
    return { type: 'redirect', to: hasProfile ? '/home' : '/onboarding' };
  }

  if (!hasProfile) {
    if (matches(pathname, '/onboarding') || isPublic) return { type: 'next' };
    return { type: 'redirect', to: '/onboarding' };
  }

  if (matches(pathname, '/onboarding')) return { type: 'redirect', to: '/home' };

  if (matches(pathname, '/console') && !hasRole(role, 'editor')) {
    return { type: 'redirect', to: '/home' };
  }

  return { type: 'next' };
}

/** 로그인 후 돌아갈 경로. 외부 주소로 튕기지 않게 내부 경로만 허용한다. */
export function safeNextPath(next: string | null | undefined, fallback = '/home'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}
