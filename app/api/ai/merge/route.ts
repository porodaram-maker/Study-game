import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { AiError } from '@/lib/ai/client';
import { LimitError } from '@/lib/ai/limits';
import { createGroupNote, MergeError, mergeRequestSchema } from '@/lib/groups/merge';

// 통합 노트 만들기 (SPEC 8.6)
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: '다시 로그인해 주세요' }, { status: 401 });

  const parsed = mergeRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '입력을 확인해 주세요' }, { status: 400 });
  }

  try {
    return NextResponse.json({ noteId: await createGroupNote(user.id, parsed.data) });
  } catch (error) {
    if (error instanceof MergeError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof LimitError) return NextResponse.json({ error: error.message }, { status: 429 });
    if (error instanceof AiError) {
      console.error('[ai/merge]', error.code, error.message);
      return NextResponse.json({ error: '노트를 만들지 못했어요. 잠시 후 다시 시도해 주세요' }, { status: 502 });
    }
    console.error('[ai/merge]', error);
    return NextResponse.json({ error: '잠시 후 다시 시도해 주세요' }, { status: 500 });
  }
}
