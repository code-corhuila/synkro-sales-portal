// Synthetic contract-shaped data for tests only (synkro-sales-api, customers, products, workflow).
export const ids = {
  customer: '550e8400-e29b-41d4-a716-446655440000',
  productA: '550e8400-e29b-41d4-a716-446655440001',
  productB: '550e8400-e29b-41d4-a716-446655440002',
  sale: '550e8400-e29b-41d4-a716-446655440003',
  saga: '550e8400-e29b-41d4-a716-446655440004',
  category: '550e8400-e29b-41d4-a716-446655440005',
  user: '550e8400-e29b-41d4-a716-446655440006',
}

export const customerFixture = (overrides = {}) => ({
  customerId: ids.customer, name: 'Ana Pérez', identityDocument: '1075123456', email: null, phone: null, address: null,
  registrationDate: '2026-09-01T10:00:00Z', active: true, ...overrides,
})
export const productFixture = (overrides = {}) => ({
  productId: ids.productA, name: 'Teclado mecánico', priceCents: 12550, stock: 40, categoryId: ids.category, active: true, ...overrides,
})
export const pageOf = <T,>(data: T[]) => ({ data, meta: { page: 1, limit: 10, total: data.length, totalPages: data.length ? 1 : 0 } })

export const sagaFixture = (overrides = {}) => ({
  sagaId: ids.saga, sagaType: 'register-sale', status: 'RUNNING', completedSteps: [],
  createdAt: '2026-10-12T15:00:00Z', updatedAt: '2026-10-12T15:00:01Z', ...overrides,
})
export const saleFixture = (overrides = {}) => ({
  saleId: ids.sale, customerId: ids.customer, createdBy: ids.user, date: '2026-10-12T15:00:02Z', totalCents: 25100, active: true,
  details: [{ detailId: 'a1', productId: ids.productA, quantity: 2, unitPriceCents: 12550, subtotalCents: 25100, active: true }], ...overrides,
})
export const failure = (status: number, error = 'INTERNAL_ERROR') => ({ status, body: { error, message: 'Raw English backend failure', traceId: 'trace-example' } })

export function deferred<T = unknown>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
