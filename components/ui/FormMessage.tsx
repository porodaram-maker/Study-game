export function FormMessage({ tone, children }: { tone: 'error' | 'info'; children: React.ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-jelly border-sticker px-4 py-3 text-sm ${
        tone === 'error' ? 'border-danger bg-surface text-ink' : 'border-ink bg-surface text-ink'
      }`}
    >
      {tone === 'error' ? (
        <span aria-hidden className="text-danger">
          ✕{' '}
        </span>
      ) : null}
      {children}
    </p>
  );
}
