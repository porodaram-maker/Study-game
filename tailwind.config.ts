import type { Config } from 'tailwindcss';

// SPEC 15장 디자인 토큰. 새 색·그림자는 여기 추가하지 않는다.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    fontSize: {
      xs: ['12px', '1.55'],
      sm: ['14px', '1.55'],
      base: ['16px', '1.55'],
      lg: ['20px', '1.2'],
      xl: ['24px', '1.2'],
      '2xl': ['32px', '1.2'],
      '3xl': ['40px', '1.2'],
    },
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        'ink-soft': 'rgb(var(--ink-soft) / <alpha-value>)',
        jelly: 'rgb(var(--jelly) / <alpha-value>)',
        pink: 'rgb(var(--pink) / <alpha-value>)',
        mint: '#6FE3C1',
        butter: '#FFD960',
        peach: '#FFB38A',
        sky: '#8ED1FF',
        danger: 'rgb(var(--danger) / <alpha-value>)',
      },
      borderRadius: { sticker: '20px', jelly: '16px' },
      borderWidth: { sticker: '2.5px' },
      boxShadow: {
        sticker: '0 4px 0 rgb(var(--ink))',
        jelly: '0 4px 0 #6A59E6',
        'jelly-pressed': '0 1px 0 #6A59E6',
        'sticker-pressed': '0 1px 0 rgb(var(--ink))',
      },
      fontFamily: {
        title: ['var(--font-jua)', 'Jua', 'sans-serif'],
        body: ['Pretendard Variable', 'Pretendard', 'sans-serif'],
        pixel: ['Galmuri11', 'monospace'],
      },
      transitionTimingFunction: {
        pop: 'cubic-bezier(.34,1.56,.64,1)',
        out: 'cubic-bezier(.22,1,.36,1)',
      },
      transitionDuration: { fast: '120ms', base: '220ms', slow: '400ms' },
      maxWidth: { student: '480px', console: '1280px' },
      height: { jelly: '52px', 'jelly-sm': '40px', capsule: '14px' },
    },
  },
  plugins: [],
};

export default config;
