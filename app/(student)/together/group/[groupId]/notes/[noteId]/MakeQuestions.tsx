'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { JellyButton } from '@/components/ui/JellyButton';
import { FormMessage } from '@/components/ui/FormMessage';

/** 통합 노트로 문제 만들기 (8.6). 하루 생성 한도를 같이 쓴다. */
export function MakeQuestions({ subject, title, text }: { subject: string; title: string; text: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'naesin' | 'suneung'>('naesin');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subject, title, mode, text }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) {
      setError(json.error ?? '연결이 끊겼어요. 다시 시도해 주세요');
      setPending(false);
      return;
    }
    router.push(`/study/${json.deckId}?new=1`);
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="모드">
        {(['naesin', 'suneung'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={`h-jelly-sm rounded-jelly border-2 border-ink font-title ${mode === m ? 'bg-jelly text-on-pastel' : 'bg-surface'}`}
          >
            {m === 'naesin' ? '내신' : '수능'}
          </button>
        ))}
      </div>
      <JellyButton block onClick={run} disabled={pending}>
        {pending ? '문제 만드는 중…' : '이 노트로 문제 만들기'}
      </JellyButton>
    </div>
  );
}
