import styles from './SalesTrendChart.module.css'

export interface ChartBar { key: string; value: number; label?: string }

const BAR_WIDTH = 28
const GAP = 12
const HEIGHT = 96

// Decorative only: the reused ReportTable right next to it is the one accessible source of
// this data, so screen readers are not made to read the chart too.
export function BarChart({ bars, caption, format = String }: {
  bars: ChartBar[]; caption: string; format?: (value: number) => string
}) {
  if (bars.length === 0) return null
  const max = Math.max(0, ...bars.map((bar) => bar.value))
  const width = bars.length * (BAR_WIDTH + GAP)
  const first = bars[0]
  const last = bars[bars.length - 1]
  return (
    <div aria-hidden="true" className={styles.plot}>
    <div className={styles.scale}><span>{format(max)}</span><span>{format(0)}</span></div>
    <div className={styles.area}>
    <svg aria-hidden="true" focusable="false" viewBox={`0 0 ${width} ${HEIGHT}`} preserveAspectRatio="none" className={styles.chart}>
      <desc>{caption}</desc>
      {bars.map((bar, index) => {
        const height = bar.value > 0 ? Math.max((bar.value / max) * (HEIGHT - 8), 2) : 0
        return <rect key={bar.key} className={styles.bar} x={index * (BAR_WIDTH + GAP) + GAP / 2} y={HEIGHT - height} width={BAR_WIDTH} height={height} rx={3}>
          <title>{bar.label ?? bar.key}: {format(bar.value)}</title>
        </rect>
      })}
    </svg>
    <div className={styles.ticks}><span>{first.label ?? first.key}</span>
      {last !== first && <span>{last.label ?? last.key}</span>}</div>
    </div>
    </div>
  )
}
