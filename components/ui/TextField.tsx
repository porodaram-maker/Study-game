import { forwardRef, type InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export const TextField = forwardRef<HTMLInputElement, Props>(function TextField(
  { label, error, hint, id, className = '', ...props },
  ref,
) {
  const inputId = id ?? props.name;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <label htmlFor={inputId} className="flex flex-col gap-1">
      <span className="font-title text-base">{label}</span>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={`h-jelly rounded-jelly border-sticker border-ink bg-surface px-4 text-base text-ink placeholder:text-ink-soft aria-[invalid=true]:border-danger ${className}`}
        {...props}
      />
      {error ? (
        <span id={`${inputId}-error`} role="alert" className="text-sm text-ink">
          <span aria-hidden className="text-danger">✕</span> {error}
        </span>
      ) : hint ? (
        <span id={`${inputId}-hint`} className="text-sm text-ink-soft">
          {hint}
        </span>
      ) : null}
    </label>
  );
});
