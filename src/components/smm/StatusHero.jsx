import { AlertTriangle, CheckCircle2, Eye, Signal } from 'lucide-react'

const toneStyles = {
  green: {
    shell: 'border-emerald-200 bg-[linear-gradient(135deg,#f4fbf7_0%,#d6f4e7_100%)]',
    icon: 'bg-pos text-white',
    dot: 'bg-pos',
    Icon: CheckCircle2,
  },
  yellow: {
    shell: 'border-amber-200 bg-[linear-gradient(135deg,#fffaf0_0%,#fdefd6_100%)]',
    icon: 'bg-warn text-white',
    dot: 'bg-warn',
    Icon: Signal,
  },
  red: {
    shell: 'border-rose-200 bg-[linear-gradient(135deg,#fff6f4_0%,#fde5df_100%)]',
    icon: 'bg-neg text-white',
    dot: 'bg-neg',
    Icon: AlertTriangle,
  },
}

const signalDots = {
  green: 'bg-pos',
  yellow: 'bg-warn',
  red: 'bg-neg',
}

export function StatusHero({ status, signals = [] }) {
  const styles = toneStyles[status?.tone] || toneStyles.green
  const Icon = styles.Icon

  return (
    <section className={`rounded-[10px] border px-5 py-5 ${styles.shell}`}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.9fr)] lg:items-center">
        <div className="flex min-w-0 items-start gap-4">
          <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-full ${styles.icon}`}>
            <Icon className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <p className="section-label">Instagram status</p>
            <h2 className="mt-2 text-2xl font-semibold leading-tight text-ink">
              {status?.title || 'Все ок'}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink2">
              {status?.description || 'Метрики тримаються в робочому діапазоні.'}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {signals.map((signal) => (
            <div
              key={signal.label}
              className="rounded-md border border-white/70 bg-white/70 px-3 py-3 shadow-sm shadow-black/[0.03]"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ink3">
                  {signal.label}
                </p>
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    signalDots[signal.tone] || styles.dot
                  }`}
                />
              </div>
              <p className="mono mt-3 text-xl font-semibold text-ink">{signal.value}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function SmmSourceIndicator({ source }) {
  return (
    <span className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink2">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pos opacity-40" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-pos" />
      </span>
      <Eye className="h-4 w-4 text-accent" />
      {source || 'Meta Business Suite'}
    </span>
  )
}
