'use client';

import type { Confidence } from '@/lib/study/schemas';

// 15.3 확신도 버튼. 픽셀 얼굴 아이콘(자신만만, 갸우뚱, 눈 가림)은 아이콘 세트가 들어오면 글자 위에 붙인다.
const OPTIONS: { value: Confidence; label: string }[] = [
  { value: 'sure', label: '확실해요' },
  { value: 'maybe', label: '애매해요' },
  { value: 'guess', label: '모르겠어요' },
];

export function ConfidencePicker({ value, onChange, disabled }: { value: Confidence | null; onChange: (v: Confidence) => void; disabled?: boolean }) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="mb-2 font-title text-base">먼저, 얼마나 자신 있어요?</legend>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`h-jelly rounded-jelly border-sticker border-ink font-title text-base shadow-sticker transition-transform duration-[180ms] ease-pop active:translate-y-[3px] active:shadow-sticker-pressed ${
              value === o.value ? 'bg-jelly text-on-pastel' : 'bg-surface text-ink'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
