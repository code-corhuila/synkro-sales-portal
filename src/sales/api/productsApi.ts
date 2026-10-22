import { apiClient } from 'shell/apiClient'
import { pathId } from '../model/identifier'
import type { Page } from '../model/page'
import type { Product } from '../model/product'

interface Options { signal?: AbortSignal }

export const PRODUCT_SEARCH_LIMIT = 10

// Documented filters only (name, active); one small page, never the whole catalogue.
export async function searchProducts(name: string, { signal }: Options = {}): Promise<Product[]> {
  const term = name.trim()
  if (!term) throw new Error('Nombre de producto inválido')
  const page = await apiClient.request<Page<Product>>('/api/v1/products', {
    query: { name: term, active: true, page: 1, limit: PRODUCT_SEARCH_LIMIT }, signal,
  })
  return page.data
}

export async function getProduct(productId: string, { signal }: Options = {}): Promise<Product> {
  return apiClient.request<Product>(`/api/v1/products/${pathId(productId)}`, { signal })
}
