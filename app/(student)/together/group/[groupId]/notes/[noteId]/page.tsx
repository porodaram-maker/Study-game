import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth/requireRole';
import { noteToText, type MergedNote } from '@/lib/ai/schemas';
import { SUBJECTS } from '@/lib/study/schemas';
import { StickerCard } from '@/components/ui/StickerCard';
import { MakeQuestions } from './MakeQuestions';

export const metadata = { title: '통합 노트 · 픽셀공부방' };

export default async function NotePage({ params }: { params: Promise<{ groupId: string; noteId: string }> }) {
  await requireProfile();
  const { groupId, noteId } = await params;
  const supabase = await createClient();
  const { data: note } = await supabase
    .from('group_notes')
    .select('id, title, subject, content, source_share_ids')
    .eq('id', noteId)
    .eq('group_id', groupId)
    .maybeSingle();
  if (!note) notFound();
  const content = note.content as MergedNote;
  const subject = (SUBJECTS as readonly string[]).includes(note.subject) ? note.subject : '기타';

  return (
    <>
      <Link href={`/together/group/${groupId}`} className="text-sm text-ink-soft">
        ← 그룹으로
      </Link>
      <div className="flex flex-col gap-1">
        <span className="text-sm text-ink-soft">
          {note.subject} · 자료 <span className="font-pixel">{note.source_share_ids.length}</span>개를 합침
        </span>
        <h1 className="text-xl">{note.title}</h1>
      </div>

      {content.sections.map((s) => (
        <StickerCard key={s.heading} className="flex flex-col gap-2">
          <h2 className="text-lg">{s.heading}</h2>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {s.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </StickerCard>
      ))}

      {content.differences.length > 0 ? (
        <StickerCard className="flex flex-col gap-2 bg-bg">
          <h2 className="text-lg">자료마다 다른 부분</h2>
          <p className="text-xs text-ink-soft">선생님께 어느 쪽이 맞는지 확인해 보세요.</p>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {content.differences.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </StickerCard>
      ) : null}

      <MakeQuestions subject={subject} title={note.title} text={noteToText(note.title, content)} />
    </>
  );
}
