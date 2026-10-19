import { apiClient } from 'shell/apiClient'
import { pathId } from '../model/identifier'
import type { Customer } from '../model/customer'
import type { Page } from '../model/page'

interface Options { signal?: AbortSignal }

// The only documented customer search is the exact identityDocument filter
// (GET /customers). It answers inactive customers too, so the form can say why one cannot be used.
export async function findCustomersByDocument(identityDocument: string, { signal }: Options = {}): Promise<Customer[]> {
  const document = identityDocument.trim()
  if (!document || document.length > 30) throw new Error('Documento de cliente inválido')
  const page = await apiClient.request<Page<Customer>>('/api/v1/customers', {
    query: { identityDocument: document, page: 1, limit: 5 }, signal,
  })
  return page.data
}

export async function getCustomer(customerId: string, { signal }: Options = {}): Promise<Customer> {
  return apiClient.request<Customer>(`/api/v1/customers/${pathId(customerId)}`, { signal })
}
