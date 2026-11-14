import { apiClient } from '../../test-doubles/shellApiClient'
import { customerFixture, ids, pageOf, productFixture } from '../../test-doubles/fixtures'
import { getCustomer, searchCustomers } from './customersApi'
import { getProduct, searchProducts } from './productsApi'

beforeEach(() => { apiClient.request.mockReset() })

describe('customersApi', () => {
  const suggestion = (overrides = {}) => ({ customerId: ids.customer, name: 'Ana María Pérez', identityDocument: '1000000001', active: true, match: 'NAME', ...overrides })
  const answer = (data: unknown[], hasMore = false) => ({ data, meta: { limit: 5, hasMore } })

  it('busca con POST y cuerpo: el texto nunca viaja en la URL ni lleva clave de idempotencia', async () => {
    apiClient.request.mockResolvedValue(answer([suggestion()]))
    const controller = new AbortController()
    const found = await searchCustomers('  perez ana ', { signal: controller.signal })
    expect(found).toEqual({ data: [suggestion()], hasMore: false })
    expect(apiClient.request).toHaveBeenCalledTimes(1)
    const [path, options] = apiClient.request.mock.calls[0]
    expect(path).toBe('/api/v1/customers/search')
    expect(options).toEqual({ method: 'POST', body: { query: 'perez ana', status: 'ACTIVE' }, signal: controller.signal })
    expect(JSON.stringify(path)).not.toContain('perez')
    expect(options).not.toHaveProperty('idempotencyKey')
    expect(options).not.toHaveProperty('query')
  })
  it('solo envía las propiedades del contrato (el servidor rechaza las desconocidas)', async () => {
    apiClient.request.mockResolvedValue(answer([]))
    await searchCustomers('1000000001')
    expect(Object.keys((apiClient.request.mock.calls[0][1] as { body: object }).body).sort()).toEqual(['query', 'status'])
  })
  it('cuenta puntos de código: 2 a 100 tras recortar, sin llamar al backend fuera de rango', async () => {
    for (const text of ['', '  ', 'a', ' a ', 'x'.repeat(101)]) {
      await expect(searchCustomers(text)).rejects.toThrow('Búsqueda de cliente inválida')
    }
    expect(apiClient.request).not.toHaveBeenCalled()
    apiClient.request.mockResolvedValue(answer([]))
    await searchCustomers('ab')
    await searchCustomers('😀'.repeat(100))
    await expect(searchCustomers('😀'.repeat(101))).rejects.toThrow('Búsqueda de cliente inválida')
    expect(apiClient.request).toHaveBeenCalledTimes(2)
  })
  it('conserva hasMore y descarta cualquier campo que no sea del contrato (sin contactos)', async () => {
    apiClient.request.mockResolvedValue(answer([{ ...suggestion({ match: 'DOCUMENT_EXACT' }), email: 'x@y.co', phone: '3000000000', address: 'Calle 1' }], true))
    const found = await searchCustomers('1000000001')
    expect(found.hasMore).toBe(true)
    expect(found.data[0]).toEqual(suggestion({ match: 'DOCUMENT_EXACT' }))
    expect(found.data[0]).not.toHaveProperty('email')
  })
  it('nunca entrega más de cinco sugerencias y lo marca como hasMore', async () => {
    const six = Array.from({ length: 6 }, (_, i) => suggestion({ customerId: `550e8400-e29b-41d4-a716-44665544010${i}`, identityDocument: `10${i}` }))
    apiClient.request.mockResolvedValue(answer(six))
    const found = await searchCustomers('10')
    expect(found.data).toHaveLength(5)
    expect(found.hasMore).toBe(true)
  })
  it('sin coincidencias devuelve una lista vacía', async () => {
    apiClient.request.mockResolvedValue(answer([]))
    expect(await searchCustomers('zzzz')).toEqual({ data: [], hasMore: false })
  })
  it.each([
    ['sin data', { meta: { limit: 5, hasMore: false } }],
    ['sin meta', { data: [] }],
    ['id que no es UUID', answer([suggestion({ customerId: 'abc' })])],
    ['match desconocido', answer([suggestion({ match: 'FUZZY' })])],
    ['nombre vacío', answer([suggestion({ name: '' })])],
    ['hasMore no booleano', { data: [], meta: { limit: 5, hasMore: 'no' } }],
    ['cuerpo nulo', null],
  ])('rechaza una respuesta mal formada: %s', async (_name, body) => {
    apiClient.request.mockResolvedValue(body)
    await expect(searchCustomers('perez')).rejects.toThrow('Respuesta de búsqueda inválida')
  })
  it('propaga el error del servicio para que el selector ofrezca reintento', async () => {
    apiClient.request.mockRejectedValue({ status: 500 })
    await expect(searchCustomers('perez')).rejects.toEqual({ status: 500 })
  })
  it('lee un cliente por id con ruta codificada y valida el UUID', async () => {
    apiClient.request.mockResolvedValue(customerFixture())
    await getCustomer(ids.customer)
    expect(apiClient.request).toHaveBeenCalledWith(`/api/v1/customers/${ids.customer}`, { signal: undefined })
    await expect(getCustomer('../sales')).rejects.toThrow('Identificador inválido')
  })
})

describe('productsApi', () => {
  it('busca activos por nombre con página y límite acotados', async () => {
    apiClient.request.mockResolvedValue(pageOf([productFixture()]))
    const found = await searchProducts(' teclado ')
    expect(found).toEqual([productFixture()])
    expect(apiClient.request).toHaveBeenCalledWith('/api/v1/products', { query: { name: 'teclado', active: true, page: 1, limit: 10 }, signal: undefined })
  })
  it('rechaza un nombre vacío sin llamar al backend', async () => {
    await expect(searchProducts('  ')).rejects.toThrow('Nombre de producto inválido')
    expect(apiClient.request).not.toHaveBeenCalled()
  })
  it('lee un producto por id y valida el UUID', async () => {
    apiClient.request.mockResolvedValue(productFixture())
    await getProduct(ids.productA)
    expect(apiClient.request).toHaveBeenCalledWith(`/api/v1/products/${ids.productA}`, { signal: undefined })
    await expect(getProduct('nope')).rejects.toThrow('Identificador inválido')
  })
})
