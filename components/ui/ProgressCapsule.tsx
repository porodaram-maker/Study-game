// 15.3 진행 바: 높이 14px 캡슐, 외곽선. 단원 기억 진행은 mint, 레벨은 jelly. 14.5: 400ms로 차오름.
export function ProgressCapsule({ value, tone = 'mint', label }: { value: number; tone?: 'mint' | 'jelly'; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="h-capsule w-full overflow-hidden rounded-full border-2 border-ink bg-surface"
    >
      <div
        className={`h-full rounded-full transition-[width] duration-slow ease-out ${tone === 'mint' ? 'bg-mint' : 'bg-jelly'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
