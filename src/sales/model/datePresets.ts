export type DatePresetId = 'today' | '7d' | '30d' | 'month'

const DAY_MS = 86_400_000

const toUtcDay = (date: Date): string => date.toISOString().slice(0, 10)
const minusDays = (date: Date, days: number): Date => new Date(date.getTime() - days * DAY_MS)
const startOfUtcMonth = (date: Date): Date => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))

// Every preset is an inclusive UTC range ending today, the same shape the manual "Desde"/"Hasta"
// fields already send: "Hoy" is `from === to`, never a half-open range that excludes today.
export function datePresetRange(preset: DatePresetId, now: Date): { from: string; to: string } {
  const to = toUtcDay(now)
  if (preset === 'today') return { from: to, to }
  if (preset === '7d') return { from: toUtcDay(minusDays(now, 6)), to }
  if (preset === '30d') return { from: toUtcDay(minusDays(now, 29)), to }
  return { from: toUtcDay(startOfUtcMonth(now)), to }
}
