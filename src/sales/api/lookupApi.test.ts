import { apiClient } from '../../test-doubles/shellApiClient'
import { customerFixture, ids, pageOf, productFixture } from '../../test-doubles/fixtures'
import { findCustomersByDocument, getCustomer } from './customersApi'
import { getProduct, searchProducts } from './productsApi'

beforeEach(() => apiClient.request.mockReset())

describe('customersApi', () => {
  it('busca por documento exacto con los únicos parámetros documentados', async () => {
    apiClient.request.mockResolvedValue(pageOf([customerFixture()]))
    const controller = new AbortController()
    const found = await findCustomersByDocument('  1075123456 ', { signal: controller.signal })
    expect(found).toEqual([customerFixture()])
    expect(apiClient.request).toHaveBeenCalledWith('/api/v1/customers', { query: { identityDocument: '1075123456', page: 1, limit: 5 }, signal: controller.signal })
  })
  it.each(['', '   ', 'x'.repeat(31)])('rechaza el documento %j sin llamar al backend', async (document) => {
    await expect(findCustomersByDocument(document)).rejects.toThrow('Documento de cliente inválido')
    expect(apiClient.request).not.toHaveBeenCalled()
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
