import type { Metadata, Viewport } from 'next';
import { Jua } from 'next/font/google';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
import './globals.css';

const jua = Jua({ weight: '400', subsets: ['latin'], display: 'swap', variable: '--font-jua', preload: false });

export const metadata: Metadata = {
  title: '픽셀공부방',
  description: '하루 10분 복습으로 별조각을 모으고 픽셀 친구를 키워요',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F3F0FF' },
    { media: '(prefers-color-scheme: dark)', color: '#1E1A33' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={jua.variable}>
      <body>{children}</body>
    </html>
  );
}
