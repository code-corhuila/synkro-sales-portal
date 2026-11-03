// Report days are UTC calendar days (RFC 3339 full dates), so they are formatted in UTC:
// formatting them in the visitor's zone would show the previous day in Bogotá.
const day = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const month = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' })

function parseDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null
}

export function formatUtcDay(value: string): string {
  const date = parseDay(value)
  return date ? day.format(date) : 'Fecha no disponible'
}

// The contract sends the first day of the month.
export function formatUtcMonth(value: string): string {
  const date = parseDay(value)
  return date ? month.format(date) : 'Fecha no disponible'
}

export function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}
