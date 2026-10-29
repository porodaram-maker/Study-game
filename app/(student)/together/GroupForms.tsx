'use client';

import { useActionState } from 'react';
import { JellyButton } from '@/components/ui/JellyButton';
import { TextField } from '@/components/ui/TextField';
import { FormMessage } from '@/components/ui/FormMessage';
import { createGroup, joinGroup } from './actions';

export function CreateGroupForm() {
  const [state, action, pending] = useActionState(createGroup, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state?.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <TextField label="그룹 이름" name="name" maxLength={20} placeholder="예: 2반 과학 스터디" />
      <JellyButton type="submit" block disabled={pending}>
        그룹 만들기
      </JellyButton>
    </form>
  );
}

export function JoinGroupForm() {
  const [state, action, pending] = useActionState(joinGroup, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      {state?.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}
      <TextField label="초대 코드" name="code" maxLength={6} autoComplete="off" className="font-pixel uppercase tracking-widest" placeholder="ABC123" />
      <JellyButton type="submit" variant="plain" block disabled={pending}>
        참가하기
      </JellyButton>
    </form>
  );
}
