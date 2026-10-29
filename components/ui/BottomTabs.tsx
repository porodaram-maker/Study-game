'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// 15.3 하단 탭. 16×16 픽셀 아이콘(집, 책, 말풍선 둘, 하트, 소파)은 아이콘 세트가 들어오면 label 위에 붙인다.
const TABS = [
  { href: '/home', label: '홈' },
  { href: '/study', label: '공부' },
  { href: '/together', label: '같이' },
  { href: '/friends', label: '친구' },
  { href: '/room', label: '내 방' },
] as const;

export function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="주요 메뉴" className="fixed inset-x-0 bottom-0 z-10 border-t-[2.5px] border-ink bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-student grid-cols-5">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`flex h-14 flex-col items-center justify-center gap-1 font-title text-sm ${active ? 'text-ink' : 'text-ink-soft'}`}
              >
                <span className={active ? 'motion-safe:animate-[tab-pop_220ms_cubic-bezier(.34,1.56,.64,1)]' : undefined}>
                  {tab.label}
                </span>
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-jelly' : 'bg-transparent'}`} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
