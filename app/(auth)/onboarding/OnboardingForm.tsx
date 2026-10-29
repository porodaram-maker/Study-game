'use client';

import { useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { onboardingSchema, type OnboardingInput } from '@/lib/auth/schemas';
import { JellyButton } from '@/components/ui/JellyButton';
import { TextField } from '@/components/ui/TextField';
import { FormMessage } from '@/components/ui/FormMessage';
import { completeOnboarding } from '../actions';

const GRADES = [1, 2, 3] as const;

export function OnboardingForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<OnboardingInput>({ resolver: zodResolver(onboardingSchema) });
  const grade = Number(useWatch({ control, name: 'grade' }));

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await completeOnboarding(values);
      if (result && !result.ok) setServerError(result.error);
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {serverError ? <FormMessage tone="error">{serverError}</FormMessage> : null}
      <TextField
        label="닉네임"
        autoComplete="nickname"
        maxLength={12}
        hint="2~12자, 한글·영문·숫자·밑줄"
        {...register('nickname')}
        error={errors.nickname?.message}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-title text-base">학년</legend>
        <div className="grid grid-cols-3 gap-3">
          {GRADES.map((g) => (
            <label
              key={g}
              className={`flex h-jelly cursor-pointer items-center justify-center rounded-jelly border-sticker border-ink font-title text-lg shadow-sticker has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-jelly ${
                grade === g ? 'bg-jelly text-on-pastel' : 'bg-surface text-ink'
              }`}
            >
              <input type="radio" value={g} className="sr-only" {...register('grade')} />
              {g}학년
            </label>
          ))}
        </div>
        {errors.grade ? (
          <span role="alert" className="text-sm text-ink">
            <span aria-hidden className="text-danger">✕</span> {errors.grade.message}
          </span>
        ) : null}
      </fieldset>
      <JellyButton type="submit" block disabled={pending}>
        {pending ? '준비하는 중…' : '시작하기'}
      </JellyButton>
    </form>
  );
}
