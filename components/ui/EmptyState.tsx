import type { ReactNode } from 'react';
import { StickerCard } from './StickerCard';

// 15.3 빈 화면: 할 일 한 줄 + 버튼 하나. 펫 포즈 스프라이트는 4단계 렌더러가 들어오면 위에 붙인다.
export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <StickerCard className="flex flex-col items-center gap-3 py-8 text-center">
      <h2 className="text-lg">{title}</h2>
      <p className="text-sm text-ink-soft">{body}</p>
      {action}
    </StickerCard>
  );
}
