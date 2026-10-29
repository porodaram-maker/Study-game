import type { HTMLAttributes } from 'react';

// 15.3 스티커 카드: 모서리 20px, ink 2.5px 외곽선, 아래쪽만 4px 단색 그림자
export function StickerCard({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-sticker border-sticker border-ink bg-surface p-4 shadow-sticker ${className}`} {...props} />;
}
