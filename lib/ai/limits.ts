import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { configNumber } from '@/lib/game/config';

export class LimitError extends Error {
  constructor(
    public readonly code: 'rate' | 'daily',
    message: string,
  ) {
    super(message);
  }
}

/** AI 엔드포인트 사용자별 속도 제한 (12장, 분당 ai.rate_limit_per_minute회) */
export async function assertAiRate(userId: string) {
  const limit = await configNumber('ai.rate_limit_per_minute');
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await createAdminClient()
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', since);
  if (error) throw error;
  if ((count ?? 0) >= limit) throw new LimitError('rate', '잠깐 쉬었다가 1분 뒤에 다시 해 주세요.');
}

/** 하루 문제 생성 횟수 (5.1, ai_daily_generate_limit). 하루 경계는 KST 새벽 4시. */
export async function generateCountToday(userId: string): Promise<{ used: number; limit: number }> {
  return countToday(userId, 'generate', 'ai_daily_generate_limit');
}

/** 하루 통합 노트 생성 횟수 (8.6, ai.daily_merge_limit) */
export async function mergeCountToday(userId: string): Promise<{ used: number; limit: number }> {
  return countToday(userId, 'merge', 'ai.daily_merge_limit');
}

async function countToday(userId: string, kind: string, limitKey: string): Promise<{ used: number; limit: number }> {
  const admin = createAdminClient();
  const limit = await configNumber(limitKey);
  const { data: dayStart, error: dayError } = await admin.rpc('app_day_start');
  if (dayError) throw dayError;
  // 재시도는 kind = *_retry로 따로 남으므로 첫 호출만 센다. 해시 재사용은 AI를 부르지 않아 세지 않는다.
  const { count, error } = await admin
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', kind)
    .gte('created_at', dayStart as string);
  if (error) throw error;
  return { used: count ?? 0, limit };
}
