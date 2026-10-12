export interface SalesFilters { from?: string; to?: string; customerId?: string }
export interface SalesQuery extends SalesFilters { page?: number }
export type FilterErrors = Partial<Record<keyof SalesFilters, string>>

export function cleanFilters(filters: SalesFilters): SalesFilters {
  return Object.fromEntries(
    (['from', 'to', 'customerId'] as const).flatMap((key) => {
      const value = filters[key]?.trim()
      return value ? [[key, value]] : []
    }),
  )
}

function validDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function validateFilters(filters: SalesFilters): FilterErrors {
  const { from, to, customerId } = cleanFilters(filters)
  const errors: FilterErrors = {}
  if (from && !validDay(from)) errors.from = 'Ingresa una fecha válida.'
  if (to && !validDay(to)) errors.to = 'Ingresa una fecha válida.'
  if (from && to && !errors.from && !errors.to && from > to) errors.to = 'Hasta debe ser igual o posterior a Desde.'
  if (customerId && !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(customerId)) {
    errors.customerId = 'Ingresa un UUID de cliente completo (36 caracteres con guiones).'
  }
  return errors
}
