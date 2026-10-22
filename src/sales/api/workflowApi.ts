import { apiClient } from 'shell/apiClient'
import { isUuid, pathId } from '../model/identifier'
import { parseSaga, type Saga } from '../model/saga'
import { MAX_LINES, type RegisterSaleRequest } from '../model/saleForm'

interface Options { signal?: AbortSignal }

// The browser starts a sale only here, through Workflow; it never calls POST /sales.
// Only what the contract accepts is copied into the body: no author, price, subtotal,
// total or sale id can reach the saga even if a caller passes one.
function whitelist(request: RegisterSaleRequest): RegisterSaleRequest {
  const { customerId, lines } = request
  if (!isUuid(customerId) || !Array.isArray(lines) || lines.length < 1 || lines.length > MAX_LINES) throw new Error('Solicitud de venta inválida')
  return {
    customerId,
    lines: lines.map(({ productId, quantity }) => {
      if (!isUuid(productId) || !Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Solicitud de venta inválida')
      return { productId, quantity }
    }),
  }
}

// The idempotency key belongs to the caller (one per submission intent); the host client
// sends it as the Idempotency-Key header. This adapter never retries on its own.
export async function startRegisterSale(request: RegisterSaleRequest, { idempotencyKey, signal }: Options & { idempotencyKey: string }): Promise<Saga> {
  if (!idempotencyKey.trim()) throw new Error('Falta la clave de idempotencia')
  const body = whitelist(request)
  return parseSaga(await apiClient.request<unknown>('/api/v1/sagas/register-sale', { method: 'POST', body, idempotencyKey, signal }))
}

export async function getSaga(sagaId: string, { signal }: Options = {}): Promise<Saga> {
  return parseSaga(await apiClient.request<unknown>(`/api/v1/sagas/${pathId(sagaId)}`, { signal }))
}
