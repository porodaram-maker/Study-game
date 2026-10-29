'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { finishSet, setMistakeType, submitAnswerAction, type SetSummary } from '@/app/(student)/review/actions';
import { JellyButton, JellyLink } from '@/components/ui/JellyButton';
import { StickerCard } from '@/components/ui/StickerCard';
import { ProgressCapsule } from '@/components/ui/ProgressCapsule';
import { FormMessage } from '@/components/ui/FormMessage';
import { MISTAKE_LABELS, MISTAKE_TYPES, type Confidence, type MistakeType } from '@/lib/study/schemas';
import type { SubmitResult } from '@/lib/study/submit';
import { ConfidencePicker } from './ConfidencePicker';
import { AnswerInput } from './AnswerInput';
import { describeAnswer, type ReviewQuestion } from './types';

type Props = { sessionId: string; questions: ReviewQuestion[]; answeredIds: string[] };

async function submitEssay(body: unknown): Promise<{ ok: true; data: SubmitResult } | { ok: false; error: string }> {
  const res = await fetch('/api/ai/grade', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({ error: '잠시 후 다시 시도해 주세요' }));
  return res.ok ? { ok: true, data: json as SubmitResult } : { ok: false, error: json.error ?? '잠시 후 다시 시도해 주세요' };
}

export function ReviewSession({ sessionId, questions, answeredIds }: Props) {
  const firstOpen = questions.findIndex((q) => !answeredIds.includes(q.id));
  const [index, setIndex] = useState(firstOpen === -1 ? questions.length : firstOpen);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [result, setResult] = useState<(SubmitResult & { picked: unknown }) | null>(null);
  const [mistake, setMistake] = useState<MistakeType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SetSummary | null>(null);
  const [pending, startTransition] = useTransition();
  const startedAt = useRef(0);

  const question = questions[index];
  const done = index >= questions.length;

  useEffect(() => {
    startedAt.current = Date.now();
  }, [index]);

  useEffect(() => {
    if (!done || summary) return;
    startTransition(async () => {
      const r = await finishSet(sessionId);
      if (r.ok) setSummary(r.data);
      else setError(r.error);
    });
  }, [done, summary, sessionId]);

  function submit(picked: unknown) {
    if (!question || !confidence) return;
    setError(null);
    const body = { sessionId, questionId: question.id, picked, confidence, durationMs: Date.now() - startedAt.current };
    startTransition(async () => {
      const r = question.type === 'essay' ? await submitEssay(body) : await submitAnswerAction(body);
      if (r.ok) setResult({ ...r.data, picked });
      else setError(r.error);
    });
  }

  function pickMistake(type: MistakeType) {
    if (!result) return;
    setMistake(type);
    startTransition(async () => {
      await setMistakeType(result.attemptId, type);
    });
  }

  function next() {
    setIndex((i) => i + 1);
    setConfidence(null);
    setResult(null);
    setMistake(null);
    setError(null);
  }

  if (done) {
    return (
      <StickerCard className="flex flex-col items-center gap-4 py-8 text-center">
        <h1 className="text-xl">세트 완료!</h1>
        {summary ? (
          <>
            <p className="font-pixel text-2xl">
              {summary.correct} / {summary.total}
            </p>
            <p className="text-sm text-ink-soft">
              {summary.overconfident > 0
                ? `확실했는데 틀린 문제가 ${summary.overconfident}개 있어요. 오답노트에서 다시 풀어 봐요.`
                : '틀린 문제는 오답노트에 모아 뒀어요.'}
            </p>
          </>
        ) : error ? (
          <FormMessage tone="error">{error}</FormMessage>
        ) : (
          <p className="text-sm text-ink-soft">결과를 정리하는 중…</p>
        )}
        <div className="flex w-full flex-col gap-2">
          <JellyLink href="/home" block>
            홈으로
          </JellyLink>
          <JellyLink href="/wrong" variant="plain" block>
            오답노트 보기
          </JellyLink>
        </div>
      </StickerCard>
    );
  }

  if (!question) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <ProgressCapsule value={index / questions.length} tone="jelly" label="세트 진행" />
        <span className="shrink-0 font-pixel text-sm">
          {index + 1}/{questions.length}
        </span>
      </div>

      <StickerCard className="flex flex-col gap-2">
        <span className="text-xs text-ink-soft">{question.concept}</span>
        <h2 className="font-body text-lg font-semibold leading-snug">{question.prompt}</h2>
      </StickerCard>

      {!result ? <ConfidencePicker value={confidence} onChange={setConfidence} disabled={pending} /> : null}

      <AnswerInput
        key={question.id}
        question={question}
        disabled={!confidence || pending}
        onSubmit={submit}
        result={result ? { picked: result.picked, correct: result.correct, answer: result.answer } : null}
      />

      {pending && question.type === 'essay' && !result ? <p className="text-sm text-ink-soft">채점하는 중…</p> : null}
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}

      {result ? (
        <StickerCard className={`flex flex-col gap-3 ${result.correct ? 'anim-pop' : ''}`} aria-live="polite">
          <p className="flex items-center gap-2 font-title text-lg">
            <span aria-hidden className={result.correct ? 'text-ink' : 'text-danger'}>
              {result.correct ? '○' : '✕'}
            </span>
            {result.correct ? '맞았어요!' : '아쉬워요'}
          </p>
          {!result.correct && question.type !== 'essay' ? (
            <p className="text-sm">
              정답: <strong>{describeAnswer(question, result.answer)}</strong>
            </p>
          ) : null}
          {result.essay ? (
            <div className="flex flex-col gap-1 text-sm">
              <p>
                루브릭 점수 <span className="font-pixel">{Math.round(result.essay.score * 100)}</span>점
              </p>
              {result.essay.missingKeywords.length > 0 ? <p>빠진 핵심 단어: {result.essay.missingKeywords.join(', ')}</p> : null}
              {result.essay.questions.map((q) => (
                <p key={q} className="text-ink-soft">
                  · {q}
                </p>
              ))}
            </div>
          ) : null}
          <p className="text-sm text-ink-soft">{result.explanation}</p>

          {!result.correct ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-ink-soft">왜 틀렸을까요? (선택)</p>
              <div className="flex flex-wrap gap-2">
                {MISTAKE_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={mistake === t}
                    onClick={() => pickMistake(t)}
                    className={`min-h-[44px] rounded-full border-2 border-ink px-3 text-sm ${mistake === t ? 'bg-jelly text-on-pastel' : 'bg-surface'}`}
                  >
                    {MISTAKE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <JellyButton block onClick={next}>
            {index + 1 === questions.length ? '결과 보기' : '다음 문제'}
          </JellyButton>
        </StickerCard>
      ) : null}
    </div>
  );
}
