import { apiClient } from 'shell/apiClient'
import { pathId } from '../model/identifier'
import type { Page } from '../model/page'
import type { Category } from '../model/category'
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

export const CATALOGUE_BATCH = 24

export interface CatalogueQuery { name?: string; categoryId?: string; page: number }

// One bounded batch of the real catalogue. The name and category filters are applied by the
// Products service over every active product, never over the page the browser already holds.
export async function listCatalogue({ name, categoryId, page }: CatalogueQuery, { signal }: Options = {}): Promise<Page<Product>> {
  const query: Record<string, string | number | boolean> = { active: true, page, limit: CATALOGUE_BATCH }
  const term = name?.trim()
  if (term) query.name = term
  if (categoryId) query.categoryId = categoryId
  return apiClient.request<Page<Product>>('/api/v1/products', { query, signal })
}

const CATEGORY_PAGE_LIMIT = 100
const MAX_CATEGORY_PAGES = 50

// Every active category, read page by page until the service says there are no more.
export async function listAllCategories({ signal }: Options = {}): Promise<Category[]> {
  const categories: Category[] = []
  for (let page = 1; page <= MAX_CATEGORY_PAGES; page++) {
    const result = await apiClient.request<Page<Category>>('/api/v1/products/categories', {
      query: { active: true, page, limit: CATEGORY_PAGE_LIMIT }, signal,
    })
    categories.push(...result.data)
    if (page >= result.meta.totalPages) return categories
  }
  throw new Error('Demasiadas páginas de categorías')
}
