'use client';

import { useActionState, useState } from 'react';
import { JellyButton } from '@/components/ui/JellyButton';
import { FormMessage } from '@/components/ui/FormMessage';
import { shareDeck } from '../../../actions';

function Check({ name, children, defaultChecked, onChange }: { name: string; children: React.ReactNode; defaultChecked?: boolean; onChange?: (v: boolean) => void }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-start gap-3 py-2">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-0.5 h-6 w-6 shrink-0 accent-[rgb(var(--jelly))]"
      />
      <span className="text-sm">{children}</span>
    </label>
  );
}

export function ShareForm({ groupId, decks }: { groupId: string; decks: { id: string; title: string; subject: string }[] }) {
  const [state, action, pending] = useActionState(shareDeck.bind(null, groupId), null);
  const [material, setMaterial] = useState(false);

  return (
    <form action={action} className="flex flex-col gap-3">
      {state?.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <label className="flex flex-col gap-1">
        <span className="font-title text-base">공유할 단원</span>
        <select name="deckId" required className="h-jelly w-full rounded-jelly border-sticker border-ink bg-surface px-4 text-base text-ink">
          {decks.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title} · {d.subject}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm text-ink-soft">AI가 만든 문제와 해설은 항상 공유돼요. 그룹원은 복사본을 가져가 풀 수 있어요.</p>
      <Check name="allowMerge" defaultChecked>
        통합 노트 재료로 쓰기 허용 <span className="text-ink-soft">(원문은 AI 입력으로만 쓰이고 그룹원에게 보이지 않아요)</span>
      </Check>
      <Check name="shareMaterial" onChange={setMaterial}>
        원문도 그룹원에게 공개
      </Check>
      {material ? (
        <div className="rounded-jelly border-sticker border-ink bg-bg p-3">
          <Check name="rights">
            이 자료를 공유할 권리가 있어요. 교과서·학원 교재·남의 필기처럼 공유하면 안 되는 자료의 저작권 문제는 올린 내가 책임져요.
          </Check>
        </div>
      ) : null}
      <JellyButton type="submit" block disabled={pending || decks.length === 0}>
        공유하기
      </JellyButton>
    </form>
  );
}
