'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SUBJECTS } from '@/lib/study/schemas';
import { JellyButton } from '@/components/ui/JellyButton';
import { FormMessage } from '@/components/ui/FormMessage';

type Source = { id: string; title: string; subject: string; owner: string };
const STEPS = ['자료 모으는 중', '빠진 내용 채우는 중', '거의 다 됐어요'];

export function MergeForm({ groupId, sources, remaining }: { groupId: string; sources: Source[]; remaining: number }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState(sources[0]?.title ?? '');
  const [subject, setSubject] = useState<string>(sources[0]?.subject ?? SUBJECTS[0]);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    if (step === null || step >= STEPS.length - 1) return;
    const t = setTimeout(() => setStep((s) => (s === null ? s : s + 1)), step === 0 ? 2500 : 9000);
    return () => clearTimeout(t);
  }, [step]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (picked.length < 2) return setError('자료를 2개 이상 골라 주세요');
    setError(null);
    setStep(0);
    const res = await fetch('/api/ai/merge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ groupId, shareIds: picked, title, subject }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      setError(json.error ?? '연결이 끊겼어요. 다시 시도해 주세요');
      setStep(null);
      return;
    }
    router.push(`/together/group/${groupId}/notes/${json.noteId}`);
  }

  if (step !== null) {
    return (
      <ol className="flex flex-col gap-3" aria-live="polite">
        {STEPS.map((label, i) => (
          <li key={label} className={`flex items-center gap-3 font-title text-lg ${i <= step ? 'text-ink' : 'text-ink-soft'}`}>
            <span aria-hidden className={`h-3 w-3 rounded-full border-2 border-ink ${i < step ? 'bg-mint' : i === step ? 'bg-jelly motion-safe:animate-pulse' : 'bg-surface'}`} />
            {label}
          </li>
        ))}
      </ol>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 font-title text-base">합칠 자료 (2~6개)</legend>
        {sources.map((s) => (
          <label key={s.id} className="flex min-h-[44px] cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={picked.includes(s.id)}
              disabled={!picked.includes(s.id) && picked.length >= 6}
              onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))}
              className="h-6 w-6 shrink-0 accent-[rgb(var(--jelly))]"
            />
            <span>
              {s.title} <span className="text-sm text-ink-soft">· {s.owner}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-title text-base">노트 이름</span>
          <input
            value={title}
            maxLength={40}
            onChange={(e) => setTitle(e.target.value)}
            className="h-jelly w-full rounded-jelly border-sticker border-ink bg-surface px-4 text-base text-ink"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-title text-base">과목</span>
          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-jelly rounded-jelly border-sticker border-ink bg-surface px-3 text-base text-ink"
          >
            {SUBJECTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-ink-soft">
        오늘 남은 통합 노트 <span className="font-pixel">{remaining}</span>번 · 원문은 AI에게만 전달되고 그룹원에게는 정리된 노트만 보여요
      </p>
      <JellyButton type="submit" block disabled={picked.length < 2 || !title.trim()}>
        통합 노트 만들기
      </JellyButton>
    </form>
  );
}
