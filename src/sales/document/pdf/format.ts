const bogota = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

// "06/11/2026 · 20:30" in America/Bogota (UTC-5, no daylight saving), the layout of the approved reference.
export function formatBogota(instant: string): string {
  const parts = Object.fromEntries(bogota.formatToParts(new Date(instant)).map((part) => [part.type, part.value]))
  return `${parts.day}/${parts.month}/${parts.year} · ${parts.hour}:${parts.minute}`
}
