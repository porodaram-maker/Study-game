'use client';

import { useActionState } from 'react';
import { JellyButton } from '@/components/ui/JellyButton';
import { TextField } from '@/components/ui/TextField';
import { FormMessage } from '@/components/ui/FormMessage';
import { createExam } from './actions';

export function ExamForm({ decks }: { decks: { id: string; title: string; subject: string }[] }) {
  const [state, action, pending] = useActionState(createExam, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state?.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <TextField label="시험 이름" name="name" maxLength={30} placeholder="예: 2학기 중간고사" required />
      <TextField label="시험 날짜" name="examDate" type="date" required />
      {decks.length > 0 ? (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 font-title text-base">시험 범위 단원</legend>
          {decks.map((d) => (
            <label key={d.id} className="flex min-h-[44px] items-center gap-3">
              <input type="checkbox" name="deckIds" value={d.id} className="h-6 w-6 accent-[rgb(var(--jelly))]" />
              <span>
                {d.title} <span className="text-sm text-ink-soft">· {d.subject}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <JellyButton type="submit" block disabled={pending}>
        시험 등록
      </JellyButton>
    </form>
  );
}
