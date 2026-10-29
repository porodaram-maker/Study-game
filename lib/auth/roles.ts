export const ROLES = ['student', 'editor', 'admin'] as const;
export type UserRole = (typeof ROLES)[number];

const RANK: Record<UserRole, number> = { student: 0, editor: 1, admin: 2 };

/** 관리자는 에디터 권한을 포함한다 (SPEC 3장 표). */
export function hasRole(actual: UserRole | null | undefined, required: UserRole): boolean {
  if (!actual) return false;
  return RANK[actual] >= RANK[required];
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}
