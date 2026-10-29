import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

// 게임 수치는 game_config에서 읽는다 (SPEC 6장). 서버는 1분 캐시한다.
const TTL_MS = 60_000;
let cache: { at: number; values: Map<string, unknown> } | null = null;

async function load(): Promise<Map<string, unknown>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.values;
  const { data, error } = await createAdminClient().from('game_config').select('key, value');
  if (error) throw new Error(`game_config를 읽지 못했습니다: ${error.message}`);
  const values = new Map(data.map((row) => [row.key as string, row.value as unknown]));
  cache = { at: Date.now(), values };
  return values;
}

export async function configNumber(key: string): Promise<number> {
  const value = (await load()).get(key);
  if (typeof value !== 'number') throw new Error(`game_config.${key} 값이 없거나 숫자가 아닙니다.`);
  return value;
}

/** 테스트나 어드민 변경 직후 캐시를 비운다. */
export function clearConfigCache() {
  cache = null;
}
