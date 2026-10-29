// 레벨 n→n+1 필요 XP = base + (n-1)×step (SPEC 6.1). SQL level_for_xp()와 같은 식.
export function levelProgress(xp: number, base: number, step: number) {
  let level = 1;
  let left = Math.max(0, Math.floor(xp));
  let need = base;
  while (left >= need) {
    left -= need;
    level += 1;
    need = base + (level - 1) * step;
  }
  return { level, into: left, need };
}

/** 스트릭 불꽃 단계 (14.3): 1~6일 s, 7~29일 m, 30~99일 l, 100일 이상 blue */
export function flameFor(streak: number): 'none' | 'flame_s' | 'flame_m' | 'flame_l' | 'flame_blue' {
  if (streak <= 0) return 'none';
  if (streak < 7) return 'flame_s';
  if (streak < 30) return 'flame_m';
  if (streak < 100) return 'flame_l';
  return 'flame_blue';
}

/** 시험까지 남은 날 (KST 날짜 기준). 0이면 D-day. */
export function daysUntil(examDate: string, today: string): number {
  return Math.round((Date.parse(`${examDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}
