import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 via-white to-slate-100 text-slate-900">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <span className="text-xl font-semibold tracking-tight">TaskFlow</span>
        <nav className="text-sm text-slate-600">
          Your work, perfectly aligned
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 pb-20 pt-10">
        <section className="rounded-3xl border border-slate-200 bg-white/80 p-10 shadow-sm backdrop-blur sm:p-16">
          <div className="max-w-2xl space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              Task management, simplified
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-5xl">
              Keep every project moving with effortless clarity.
            </h1>
            <p className="text-lg leading-relaxed text-slate-600">
              TaskFlow keeps your team in sync with flexible boards, smart
              priorities, and progress that is always visible.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/teams"
                className="inline-flex h-12 items-center justify-center rounded-full bg-slate-900 px-6 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Get Started
              </Link>
              <span className="text-sm text-slate-500">
                No setup required. Jump straight in.
              </span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
