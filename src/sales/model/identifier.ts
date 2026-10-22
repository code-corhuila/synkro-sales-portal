const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

export const isUuid = (value: string) => UUID.test(value)

// Identifiers reach a URL path: only a full UUID is ever interpolated.
export function pathId(value: string): string {
  if (!isUuid(value)) throw new Error('Identificador inválido')
  return value
}
