import { apiClient } from 'shell/apiClient'
import { pathId, isUuid } from '../model/identifier'
import {
  CUSTOMER_QUERY_MAX, CUSTOMER_QUERY_MIN, CUSTOMER_SUGGESTION_LIMIT, customerQueryLength,
  type Customer, type CustomerMatch, type CustomerSearchResult, type CustomerSuggestion,
} from '../model/customer'

interface Options { signal?: AbortSignal }

export async function getCustomer(customerId: string, { signal }: Options = {}): Promise<Customer> {
  return apiClient.request<Customer>(`/api/v1/customers/${pathId(customerId)}`, { signal })
}

const MATCHES: readonly string[] = ['DOCUMENT_EXACT', 'DOCUMENT_PREFIX', 'NAME']

function parseSuggestion(value: unknown): CustomerSuggestion {
  const invalid = () => new Error('Respuesta de búsqueda inválida')
  if (!value || typeof value !== 'object') throw invalid()
  const item = value as Record<string, unknown>
  if (typeof item.customerId !== 'string' || !isUuid(item.customerId)) throw invalid()
  if (typeof item.name !== 'string' || !item.name.trim()) throw invalid()
  if (typeof item.identityDocument !== 'string' || !item.identityDocument.trim()) throw invalid()
  if (typeof item.active !== 'boolean') throw invalid()
  if (typeof item.match !== 'string' || !MATCHES.includes(item.match)) throw invalid()
  // Only the contract's fields are kept: anything else the service might add never reaches the screen.
  return { customerId: item.customerId, name: item.name, identityDocument: item.identityDocument, active: item.active, match: item.match as CustomerMatch }
}

// Bounded name-or-document search served by Customers (HU-CLI-05, POST /api/v1/customers/search).
// The text travels in the body, never in the URL. Sales only ever asks for ACTIVE customers: the
// service's own default, sent explicitly. A read: no Idempotency-Key, safe to retry and to abort.
// Suggestions are advisory; the Workflow's own customer validation decides at registration.
export async function searchCustomers(text: string, { signal }: Options = {}): Promise<CustomerSearchResult> {
  const query = text.trim()
  const length = customerQueryLength(query)
  if (length < CUSTOMER_QUERY_MIN || length > CUSTOMER_QUERY_MAX) throw new Error('Búsqueda de cliente inválida')
  const answer = await apiClient.request<unknown>('/api/v1/customers/search', { method: 'POST', body: { query, status: 'ACTIVE' }, signal })
  const invalid = () => new Error('Respuesta de búsqueda inválida')
  if (!answer || typeof answer !== 'object') throw invalid()
  const { data, meta } = answer as { data?: unknown; meta?: { hasMore?: unknown } }
  if (!Array.isArray(data) || !meta || typeof meta !== 'object' || typeof meta.hasMore !== 'boolean') throw invalid()
  const parsed = data.map(parseSuggestion)
  return { data: parsed.slice(0, CUSTOMER_SUGGESTION_LIMIT), hasMore: meta.hasMore || parsed.length > CUSTOMER_SUGGESTION_LIMIT }
}
