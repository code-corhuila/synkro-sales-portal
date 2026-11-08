import { apiClient } from 'shell/apiClient'
import { SaleDocumentError } from '../document/types'
import type { Customer } from '../model/customer'
import { isUuid } from '../model/identifier'
import type { Page } from '../model/page'
import type { Product } from '../model/product'
import type { Sale } from '../model/sale'
import { getCustomer } from './customersApi'
import { runPool } from './pool'
import { getProduct } from './productsApi'
import { getSale } from './salesApi'

// Reads everything a sale document needs, only through the Host's client and only with capabilities
// the caller already has: Sales (authoritative, role/ownership enforced by the server), Customers and
// Products (ADMIN and SALESPERSON), and the category list (all roles). No ADMIN-only endpoint is used.
export const MAX_SOURCE_CONCURRENCY = 4
const CATEGORY_PAGE_LIMIT = 100
const MAX_CATEGORY_PAGES = 10

export interface SaleDocumentSources {
  sale: Sale
  customer: Customer | null
  products: Record<string, Product | null>
  categories: Record<string, string>
}

interface CategoryResponse { categoryId: string; name: string; active: boolean }
type Subject = 'sale' | 'customer' | 'product' | 'categories'
interface SharedError { status?: number; body?: { traceId?: string } }

const abortError = () => new DOMException('The operation was aborted.', 'AbortError')

function translate(error: unknown, subject: Subject, id?: string): SaleDocumentError {
  if (error instanceof SaleDocumentError) return error
  const { status, body } = (error ?? {}) as SharedError
  const traceId = body?.traceId
  if (status === 401) return new SaleDocumentError('SESSION_EXPIRED', 'La sesión ha finalizado.', { traceId })
  if (status === 403) return new SaleDocumentError('FORBIDDEN', 'No tienes permiso para esta venta.', { traceId })
  if (status === 404) {
    if (subject === 'sale') return new SaleDocumentError('NOT_FOUND', 'La venta no existe o no está disponible.', { traceId })
    if (subject === 'customer') return new SaleDocumentError('CUSTOMER_UNAVAILABLE', 'El cliente no está disponible.', { traceId })
    if (subject === 'product') return new SaleDocumentError('PRODUCT_UNAVAILABLE', 'Un producto no está disponible.', { details: id ? [id] : [], traceId })
  }
  return new SaleDocumentError('TRANSPORT', 'No se pudo leer la información de la venta.', { traceId })
}

// Only an actual related-record404 can become an explicitly unavailable reference.
// Session/access failures, transport errors and malformed successful records still fail closed.
async function currentRecord<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    const value = await work()
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new SaleDocumentError('TRANSPORT', 'El servicio devolvió datos no válidos.')
    }
    return value
  }
  catch (error) {
    if ((error as SharedError | null)?.status === 404) return null
    throw error
  }
}

async function readCategories(signal: AbortSignal | undefined): Promise<Record<string, string>> {
  const names: Record<string, string> = {}
  let totalPages = 1
  for (let page = 1; page <= totalPages; page += 1) {
    if (page > MAX_CATEGORY_PAGES) throw new SaleDocumentError('TRANSPORT', 'Hay más categorías de las que se admiten leer.')
    const result = await apiClient.request<Page<CategoryResponse>>('/api/v1/products/categories', { query: { page, limit: CATEGORY_PAGE_LIMIT }, signal })
    for (const category of result.data) names[category.categoryId] = category.name
    totalPages = result.meta.totalPages
  }
  return names
}

export async function loadSaleDocumentSources(saleId: string, { signal }: { signal?: AbortSignal } = {}): Promise<SaleDocumentSources> {
  const live = () => { if (signal?.aborted) throw abortError() }
  const guarded = async <T>(subject: Subject, work: () => Promise<T>, id?: string): Promise<T> => {
    try {
      const value = await work()
      live()
      return value
    } catch (error) {
      if (signal?.aborted) throw abortError()
      throw translate(error, subject, id)
    }
  }

  if (!isUuid(saleId)) throw new SaleDocumentError('NOT_FOUND', 'La venta no existe o no está disponible.')
  // The sale goes first and alone: if the server refuses it (401/403/404) nothing else is requested,
  // so a refused or foreign sale never leads to customer or product reads.
  const sale = await guarded('sale', () => getSale(saleId, { signal }))
  if (sale.saleId.toLowerCase() !== saleId.toLowerCase()) throw new SaleDocumentError('INVALID_SALE', 'La respuesta no corresponde a la venta pedida.')

  let customer!: Customer | null
  let categories: Record<string, string> = {}
  const products: Record<string, Product | null> = {}
  const tasks: (() => Promise<void>)[] = [
    async () => { customer = await guarded('customer', () => currentRecord(() => getCustomer(sale.customerId, { signal }))) },
    async () => { categories = await guarded('categories', () => readCategories(signal)) },
    ...[...new Set((sale.details ?? []).map((line) => line.productId))].map((productId) => async () => {
      products[productId] = await guarded('product', async () => {
        const product = await currentRecord(() => getProduct(productId, { signal }))
        if (product === null) return null
        // The dictionary is keyed by the requested id; without this check a server/double that answers
        // the wrong product for it would silently lend that product's name to the requested id's line.
        if (product.productId.toLowerCase() !== productId.toLowerCase()) {
          throw new SaleDocumentError('PRODUCT_UNAVAILABLE', 'La respuesta no corresponde al producto pedido.', { details: [productId] })
        }
        return product
      }, productId)
    }),
  ]
  await runPool(tasks, MAX_SOURCE_CONCURRENCY)
  return { sale, customer, products, categories }
}
