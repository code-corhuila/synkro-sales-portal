const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const dateTime = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' })

export function formatCents(cents: number): string {
  // The host parses JSON as numbers. Lost int64 precision cannot be recovered;
  // refuse unsafe values visibly rather than showing a rounded financial amount.
  if (!Number.isSafeInteger(cents) || cents < 0) return 'Importe fuera del rango seguro'
  const integer = BigInt(cents)
  const fraction = (integer % 100n).toString().padStart(2, '0')
  return money.formatToParts(integer / 100n).map((part) => part.type === 'fraction' ? fraction : part.value).join('')
}

export function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : dateTime.format(date)
}
