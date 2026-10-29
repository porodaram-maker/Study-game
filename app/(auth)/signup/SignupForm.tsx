'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signupSchema, type SignupInput } from '@/lib/auth/schemas';
import { JellyButton } from '@/components/ui/JellyButton';
import { TextField } from '@/components/ui/TextField';
import { FormMessage } from '@/components/ui/FormMessage';
import { signup } from '../actions';

function CheckRow({ id, error, children, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { error?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex min-h-[44px] cursor-pointer items-center gap-3">
        <input id={id} type="checkbox" className="h-6 w-6 shrink-0 accent-[rgb(var(--jelly))]" aria-invalid={Boolean(error)} {...props} />
        <span className="text-sm">{children}</span>
      </label>
      {error ? (
        <span role="alert" className="text-sm text-ink">
          <span aria-hidden className="text-danger">✕</span> {error}
        </span>
      ) : null}
    </div>
  );
}

export function SignupForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupInput>({ resolver: zodResolver(signupSchema) });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await signup(values);
      if (!result) return;
      if (result.ok) setSent(result.message ?? null);
      else setServerError(result.error);
    });
  });

  if (sent) return <FormMessage tone="info">{sent}</FormMessage>;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      {serverError ? <FormMessage tone="error">{serverError}</FormMessage> : null}
      <TextField label="이메일" type="email" autoComplete="email" {...register('email')} error={errors.email?.message} />
      <TextField
        label="비밀번호"
        type="password"
        autoComplete="new-password"
        hint="8자 이상"
        {...register('password')}
        error={errors.password?.message}
      />
      <CheckRow id="age14" {...register('age14')} error={errors.age14?.message}>
        만 14세 이상이에요
      </CheckRow>
      <CheckRow id="terms" {...register('terms')} error={errors.terms?.message}>
        이용약관과 개인정보처리방침에 동의해요
      </CheckRow>
      <p className="text-xs text-ink-soft">
        이메일, 닉네임, 학년만 받아요. 실명, 전화번호, 생년월일은 받지 않아요.
      </p>
      <JellyButton type="submit" block disabled={pending} className="mt-3">
        {pending ? '가입하는 중…' : '가입하기'}
      </JellyButton>
    </form>
  );
}
