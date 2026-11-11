import { useState } from 'react'
import styles from './SalesTrendChart.module.css'

export interface ChartBar { key: string; value: number; label?: string; detail?: string }

const BAR_WIDTH = 28
const GAP = 12
const HEIGHT = 96

// The SVG stays decorative (the reused ReportTable next to it is the one accessible source of
// this data), but the point buttons below it are real, focusable controls: clicking or tabbing
// to one moves the live readout to that day/month, so a sighted or keyboard person can read an
// exact amount without hunting through the table. It opens on the most recent point.
export function BarChart({ bars, caption, format = String }: {
  bars: ChartBar[]; caption: string; format?: (value: number) => string
}) {
  const [selected, setSelected] = useState<number | null>(null)
  if (bars.length === 0) return null
  const index = selected !== null && selected < bars.length ? selected : bars.length - 1
  const active = bars[index]
  const max = Math.max(0, ...bars.map((bar) => bar.value))
  const width = bars.length * (BAR_WIDTH + GAP)

  return (
    <div className={styles.plot}>
      <p role="status" className={styles.readout}>
        <span className={styles.readoutLabel}>{active.label ?? active.key}</span>
        <span className={styles.readoutValue}>{format(active.value)}</span>
        {active.detail && <span className={styles.readoutDetail}>{active.detail}</span>}
      </p>
      <div className={styles.area}>
        <svg aria-hidden="true" focusable="false" viewBox={`0 0 ${width} ${HEIGHT}`} preserveAspectRatio="none" className={styles.chart}>
          <desc>{caption}</desc>
          {bars.map((bar, i) => {
            const height = bar.value > 0 ? Math.max((bar.value / max) * (HEIGHT - 8), 2) : 0
            return <rect key={bar.key} className={i === index ? `${styles.bar} ${styles.barActive}` : styles.bar}
              x={i * (BAR_WIDTH + GAP) + GAP / 2} y={HEIGHT - height} width={BAR_WIDTH} height={height} rx={3} />
          })}
        </svg>
      </div>
      <div role="group" aria-label={caption} className={styles.points}>
        {bars.map((bar, i) => (
          <button key={bar.key} type="button" className={styles.point} aria-pressed={i === index}
            onClick={() => setSelected(i)}>{bar.label ?? bar.key}</button>
        ))}
      </div>
    </div>
  )
}

// A horizontal ranking (name, share of the leader as a bar, value): decorative, like BarChart,
// since the reused ReportTable next to it stays the one accessible source for this data.
export function RankingBars({ bars, format = String }: { bars: ChartBar[]; format?: (value: number) => string }) {
  if (bars.length === 0) return null
  const max = Math.max(0, ...bars.map((bar) => bar.value))
  return (
    <ol aria-hidden="true" className={styles.ranking}>
      {bars.map((bar, index) => (
        <li key={bar.key} className={styles.rankItem}>
          <div className={styles.rankHead}>
            <span className={styles.rankName}>
              <span className={styles.rankNumber}>{String(index + 1).padStart(2, '0')}</span>
              <span>{bar.label ?? bar.key}</span>
            </span>
            <span className={styles.rankValue}>{format(bar.value)}</span>
          </div>
          <div className={styles.rankTrack}>
            <div className={styles.rankFill} style={{ width: `${max > 0 ? Math.max(0, Math.min(100, (bar.value / max) * 100)) : 0}%` }} />
          </div>
          {bar.detail && <span className={styles.rankDetail}>{bar.detail}</span>}
        </li>
      ))}
    </ol>
  )
}
