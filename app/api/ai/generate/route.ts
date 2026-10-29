import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AiError } from '@/lib/ai/client';
import { LimitError } from '@/lib/ai/limits';
import { generateDeck } from '@/lib/study/generate';
import { generateRequestSchema } from '@/lib/study/schemas';

// 자료 → 문제 생성 (11.1). 한도 확인, 해시 재사용, zod 검증과 1회 재시도.
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '다시 로그인해 주세요' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (!profile) return NextResponse.json({ error: '첫 설정을 먼저 마쳐 주세요' }, { status: 403 });

  const parsed = generateRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '입력을 확인해 주세요' }, { status: 400 });
  }

  try {
    const result = await generateDeck(user.id, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof LimitError) return NextResponse.json({ error: error.message }, { status: 429 });
    if (error instanceof AiError) {
      console.error('[ai/generate]', error.code, error.message);
      const message =
        error.code === 'refused' ? '이 자료로는 문제를 만들 수 없어요. 다른 자료로 해 볼까요?' : '문제를 만들지 못했어요. 잠시 후 다시 시도해 주세요';
      return NextResponse.json({ error: message }, { status: 502 });
    }
    console.error('[ai/generate]', error);
    return NextResponse.json({ error: '잠시 후 다시 시도해 주세요' }, { status: 500 });
  }
}
