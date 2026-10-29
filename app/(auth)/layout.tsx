export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-student flex-col justify-center gap-6 px-4 py-12">{children}</main>;
}
