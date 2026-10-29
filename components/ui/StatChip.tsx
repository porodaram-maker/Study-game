// 15.3 알약 칩: 픽셀 아이콘 자리 + Galmuri 숫자. 아이콘 스프라이트는 4단계에서 연결한다.
export function StatChip({ label, value, tone }: { label: string; value: number | string; tone: 'butter' | 'peach' | 'jelly' }) {
  const bg = { butter: 'bg-butter', peach: 'bg-peach', jelly: 'bg-jelly' }[tone];
  return (
    <span className={`inline-flex h-9 items-center gap-2 rounded-full border-sticker border-ink px-3 text-on-pastel ${bg}`}>
      <span className="text-xs font-title">{label}</span>
      <span className="font-pixel text-sm">{value}</span>
    </span>
  );
}
