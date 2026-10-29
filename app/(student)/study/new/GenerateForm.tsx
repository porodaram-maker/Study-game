'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { generateRequestSchema, SUBJECTS, type GenerateRequest } from '@/lib/study/schemas';
import { JellyButton } from '@/components/ui/JellyButton';
import { TextField } from '@/components/ui/TextField';
import { FormMessage } from '@/components/ui/FormMessage';

// 15.3 로딩: 긴 작업은 단계 표시
const STEPS = ['자료 읽는 중', '문제 만드는 중', '거의 다 됐어요'];

const selectClass = 'h-jelly w-full rounded-jelly border-sticker border-ink bg-surface px-4 text-base text-ink';

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <span role="alert" className="text-sm text-ink">
      <span aria-hidden className="text-danger">✕</span> {message}
    </span>
  );
}

export function GenerateForm({ remaining }: { remaining: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<number | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<GenerateRequest>({ resolver: zodResolver(generateRequestSchema), defaultValues: { mode: 'naesin', subject: '국어' } });

  useEffect(() => {
    if (step === null || step >= STEPS.length - 1) return;
    const t = setTimeout(() => setStep((s) => (s === null ? s : s + 1)), step === 0 ? 2500 : 9000);
    return () => clearTimeout(t);
  }, [step]);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    setStep(0);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? '잠시 후 다시 시도해 주세요');
        setStep(null);
        return;
      }
      const params = new URLSearchParams({ new: '1' });
      if (json.truncated) params.set('truncated', '1');
      router.push(`/study/${json.deckId}?${params}`);
    } catch {
      setError('연결이 끊겼어요. 다시 시도해 주세요');
      setStep(null);
    }
  });

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
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-title text-base">과목</span>
          <select className={selectClass} {...register('subject')}>
            {SUBJECTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-title text-base">모드</span>
          <select className={selectClass} {...register('mode')}>
            <option value="naesin">내신</option>
            <option value="suneung">수능</option>
          </select>
        </label>
      </div>
      <TextField label="단원 이름" maxLength={40} placeholder="예: 광합성" {...register('title')} error={errors.title?.message} />
      <label className="flex flex-col gap-1">
        <span className="font-title text-base">자료</span>
        <textarea
          rows={10}
          placeholder="교과서, 프린트, 필기 내용을 붙여 넣어 주세요"
          className="w-full rounded-jelly border-sticker border-ink bg-surface px-4 py-3 text-base text-ink placeholder:text-ink-soft"
          {...register('text')}
          aria-invalid={Boolean(errors.text)}
        />
        <FieldError message={errors.text?.message} />
      </label>
      <p className="text-xs text-ink-soft">
        오늘 남은 생성 <span className="font-pixel">{remaining}</span>번 · 같은 자료는 횟수를 쓰지 않아요
      </p>
      <JellyButton type="submit" block>
        문제 만들기
      </JellyButton>
    </form>
  );
}
