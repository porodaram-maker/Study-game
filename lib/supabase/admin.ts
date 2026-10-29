import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { supabaseEnv } from './env';

/**
 * service_role 클라이언트. RLS를 건너뛰므로 채점·보상·생성 저장처럼 서버만 하는 일에만 쓰고,
 * 호출 전에 반드시 requireProfile()로 사용자를 확인한 뒤 그 id만 넘긴다.
 */
export function createAdminClient() {
  const { url } = supabaseEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다 (.env.example 참고).');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
