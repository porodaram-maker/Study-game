import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'jelly' | 'butter' | 'plain';
type Size = 'md' | 'sm';

// 15.3 젤리 버튼: 굵은 외곽선 + 아래 4px 그림자, 누르면 3px 내려감(14.5: 80ms 눌림 / 180ms 튕김)
const base =
  'inline-flex select-none items-center justify-center gap-2 border-sticker border-ink font-title ' +
  'transition-[transform,box-shadow] duration-[180ms] ease-pop active:translate-y-[3px] active:duration-[80ms] ' +
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0';

const variants: Record<Variant, string> = {
  jelly: 'bg-jelly text-on-pastel shadow-jelly active:shadow-jelly-pressed',
  butter: 'bg-butter text-on-pastel shadow-sticker active:shadow-sticker-pressed',
  plain: 'bg-surface text-ink shadow-sticker active:shadow-sticker-pressed',
};

const sizes: Record<Size, string> = {
  md: 'h-jelly rounded-jelly px-6 text-lg',
  sm: 'h-jelly-sm min-w-[44px] rounded-jelly px-4 text-base',
};

export function jellyClass(variant: Variant = 'jelly', size: Size = 'md', extra = '') {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  block?: boolean;
};

export function JellyButton({ variant, size, block, className = '', type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={jellyClass(variant, size, `${block ? 'w-full' : ''} ${className}`)} {...props} />;
}

export function JellyLink(props: { href: string; variant?: Variant; size?: Size; block?: boolean; children: ReactNode }) {
  const { href, variant, size, block, children } = props;
  return (
    <Link href={href} className={jellyClass(variant, size, block ? 'w-full' : '')}>
      {children}
    </Link>
  );
}
