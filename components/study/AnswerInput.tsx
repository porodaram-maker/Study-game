'use client';

import { useState } from 'react';
import { JellyButton } from '@/components/ui/JellyButton';
import type { ReviewQuestion } from './types';

type Props = {
  question: ReviewQuestion;
  disabled: boolean;
  onSubmit: (picked: unknown) => void;
  /** 답한 뒤 보기에 정답·오답 표시 */
  result?: { picked: unknown; correct: boolean; answer: unknown } | null;
};

const optionBase =
  'flex min-h-[52px] w-full items-center gap-3 rounded-jelly border-sticker border-ink bg-surface px-4 py-3 text-left shadow-sticker transition-transform duration-[180ms] ease-pop enabled:active:translate-y-[3px] enabled:active:shadow-sticker-pressed disabled:cursor-not-allowed';

function Mark({ correct }: { correct: boolean }) {
  return (
    <span aria-hidden className={`ml-auto font-title text-lg ${correct ? 'text-ink' : 'text-danger'}`}>
      {correct ? '○' : '✕'}
    </span>
  );
}

export function AnswerInput({ question, disabled, onSubmit, result }: Props) {
  const [text, setText] = useState('');
  const [ox, setOx] = useState<'O' | 'X' | null>(null);
  const [reason, setReason] = useState<number | null>(null);
  const locked = disabled || Boolean(result);

  if (question.type === 'mcq') {
    return (
      <ol className="flex flex-col gap-2">
        {question.options?.map((option, i) => {
          const isAnswer = result && result.answer === i;
          const isPicked = result && result.picked === i;
          const anim = isPicked ? (result.correct ? 'anim-pop' : 'anim-shake') : '';
          return (
            <li key={i}>
              <button
                type="button"
                disabled={locked}
                onClick={() => onSubmit(i)}
                className={`${optionBase} ${isAnswer ? 'bg-mint text-on-pastel' : ''} ${anim} ${locked && !result ? 'opacity-50' : ''}`}
              >
                <span className="font-pixel text-sm">{i + 1}</span>
                <span>{option}</span>
                {isAnswer ? <Mark correct /> : isPicked ? <Mark correct={false} /> : null}
              </button>
            </li>
          );
        })}
      </ol>
    );
  }

  if (question.type === 'ox_reason') {
    const ready = ox !== null && reason !== null;
    return (
      <div className={`flex flex-col gap-3 ${locked && !result ? 'opacity-50' : ''}`}>
        <div className="grid grid-cols-2 gap-2">
          {(['O', 'X'] as const).map((v) => (
            <button
              key={v}
              type="button"
              disabled={locked}
              aria-pressed={ox === v}
              onClick={() => setOx(v)}
              className={`${optionBase} justify-center font-title text-xl ${ox === v ? 'bg-jelly text-on-pastel' : ''}`}
            >
              {v}
            </button>
          ))}
        </div>
        <p className="font-title text-base">이유는?</p>
        <ol className="flex flex-col gap-2">
          {question.options?.map((option, i) => (
            <li key={i}>
              <button
                type="button"
                disabled={locked}
                aria-pressed={reason === i}
                onClick={() => setReason(i)}
                className={`${optionBase} ${reason === i ? 'bg-jelly text-on-pastel' : ''}`}
              >
                <span className="font-pixel text-sm">{i + 1}</span>
                <span>{option}</span>
              </button>
            </li>
          ))}
        </ol>
        {!result ? (
          <JellyButton block disabled={locked || !ready} onClick={() => onSubmit({ ox, reason })}>
            제출하기
          </JellyButton>
        ) : null}
      </div>
    );
  }

  // blank, essay
  const multiline = question.type === 'essay';
  const fieldClass =
    'w-full rounded-jelly border-sticker border-ink bg-surface px-4 py-3 text-base text-ink placeholder:text-ink-soft disabled:opacity-50';
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSubmit(text.trim());
      }}
    >
      <label className="sr-only" htmlFor={`answer-${question.id}`}>
        답
      </label>
      {multiline ? (
        <textarea
          id={`answer-${question.id}`}
          rows={6}
          maxLength={2000}
          disabled={locked}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="내 말로 설명해 보세요"
          className={fieldClass}
        />
      ) : (
        <input
          id={`answer-${question.id}`}
          disabled={locked}
          value={text}
          maxLength={100}
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
          placeholder="빈칸에 들어갈 말"
          className={`h-jelly ${fieldClass}`}
        />
      )}
      {!result ? (
        <JellyButton type="submit" block disabled={locked || !text.trim()}>
          제출하기
        </JellyButton>
      ) : null}
    </form>
  );
}
