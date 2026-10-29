'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@/lib/auth/schemas';
import { JellyButton } from '@/components/ui/JellyButton';
import { TextField } from '@/components/ui/TextField';
import { FormMessage } from '@/components/ui/FormMessage';
import { login } from '../actions';

export function LoginForm({ next, linkError }: { next?: string; linkError?: boolean }) {
  const [serverError, setServerError] = useState<string | null>(
    linkError ? '인증 링크가 만료됐어요. 다시 로그인해 주세요' : null,
  );
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await login(values, next);
      if (result && !result.ok) setServerError(result.error);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
      {serverError ? <FormMessage tone="error">{serverError}</FormMessage> : null}
      <TextField label="이메일" type="email" autoComplete="email" {...register('email')} error={errors.email?.message} />
      <TextField
        label="비밀번호"
        type="password"
        autoComplete="current-password"
        {...register('password')}
        error={errors.password?.message}
      />
      <JellyButton type="submit" block disabled={pending} className="mt-3">
        {pending ? '들어가는 중…' : '로그인'}
      </JellyButton>
    </form>
  );
}
