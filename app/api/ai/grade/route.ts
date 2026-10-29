import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AiError } from '@/lib/ai/client';
import { LimitError } from '@/lib/ai/limits';
import { submitAnswer, SubmitError } from '@/lib/study/submit';
import { submitRequestSchema } from '@/lib/study/schemas';

// 서술형 답 제출: 루브릭 AI 채점 후 submit_answer로 기록한다 (11.1 /api/ai/grade).
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '다시 로그인해 주세요' }, { status: 401 });

  const parsed = submitRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: '입력을 확인해 주세요' }, { status: 400 });

  try {
    return NextResponse.json(await submitAnswer(user.id, parsed.data, { allowEssay: true }));
  } catch (error) {
    if (error instanceof SubmitError) {
      const status = error.code === 'not_found' ? 404 : error.code === 'invalid_answer' ? 400 : 409;
      return NextResponse.json({ error: error.message }, { status });
    }
    if (error instanceof LimitError) return NextResponse.json({ error: error.message }, { status: 429 });
    if (error instanceof AiError) {
      console.error('[ai/grade]', error.code, error.message);
      return NextResponse.json({ error: '채점하지 못했어요. 잠시 후 다시 시도해 주세요' }, { status: 502 });
    }
    console.error('[ai/grade]', error);
    return NextResponse.json({ error: '잠시 후 다시 시도해 주세요' }, { status: 500 });
  }
}
