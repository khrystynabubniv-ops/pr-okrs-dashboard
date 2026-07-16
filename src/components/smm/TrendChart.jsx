import { useEffect, useRef, useState } from 'react'
import {
  Area,
  AreaChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatDecimal, formatNumber } from '../../lib/smmData'

const CHART_HEIGHT = 112

export function TrendChart({ trend }) {
  const latest = trend?.data?.at(-1)?.value
  const gradientId = `smm-${trend?.key || 'trend'}-gradient`
  const chartRef = useRef(null)
  const [chartWidth, setChartWidth] = useState(0)

  useEffect(() => {
    const node = chartRef.current
    if (!node) return undefined

    function updateWidth() {
      setChartWidth(Math.max(0, Math.floor(node.getBoundingClientRect().width)))
    }

    updateWidth()

    if (!window.ResizeObserver) return undefined

    const observer = new window.ResizeObserver((entries) => {
      const entry = entries[0]
      setChartWidth(Math.max(0, Math.floor(entry.contentRect.width)))
    })
    observer.observe(node)

    return () => observer.disconnect()
  }, [])

  return (
    <article className="panel min-w-0 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">{trend.title}</p>
          <p className="mt-1 text-xs font-medium text-ink3">{trend.metricLabel}</p>
        </div>
        <p className="mono text-2xl font-semibold leading-none text-ink">
          {formatTrendValue(latest, trend.unit)}
        </p>
      </div>
      <div ref={chartRef} className="mt-4 h-28 min-w-0">
        {chartWidth > 0 ? (
          <AreaChart
            width={chartWidth}
            height={CHART_HEIGHT}
            data={trend.data}
            margin={{ top: 8, right: 0, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="week" hide />
            <YAxis hide domain={['dataMin', 'dataMax']} />
            <Tooltip content={<TrendTooltip unit={trend.unit} label={trend.metricLabel} />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--accent)"
              strokeWidth={2.5}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: 'var(--accent-d)' }}
            />
          </AreaChart>
        ) : (
          <div className="h-full animate-pulse rounded-md bg-line2" />
        )}
      </div>
    </article>
  )
}

function TrendTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-md border border-line bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-semibold text-ink">{payload[0]?.payload?.week}</p>
      <p className="mt-1 text-ink2">
        {label}: {formatTrendValue(payload[0].value, unit)}
      </p>
    </div>
  )
}

function formatTrendValue(value, unit) {
  if (value === null || value === undefined) return '—'
  if (unit === '%') return `${formatDecimal(value)}%`
  return formatNumber(value)
}
