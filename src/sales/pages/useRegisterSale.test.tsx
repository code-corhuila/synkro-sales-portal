import { act, renderHook } from '@testing-library/react'
import { apiClient } from '../../test-doubles/shellApiClient'
import { deferred, failure, ids, sagaFixture, saleFixture } from '../../test-doubles/fixtures'
import { useRegisterSale } from './useRegisterSale'

const request = { customerId: ids.customer, lines: [{ productId: ids.productA, quantity: 2 }] }
const changed = { customerId: ids.customer, lines: [{ productId: ids.productA, quantity: 3 }] }
const completedSaga = sagaFixture({ status: 'COMPLETED', completedSteps: ['validate-customer', 'reserve-stock', 'register-sale'], saleId: ids.sale })
const SAGAS = '/api/v1/sagas'

const calls = (matcher: (path: string, method?: string) => boolean) =>
  apiClient.request.mock.calls.filter(([path, options]) => matcher(path, options?.method))
const posts = () => calls((path, method) => path === `${SAGAS}/register-sale` && method === 'POST')
const gets = () => calls((path) => path === `${SAGAS}/${ids.saga}`)
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

type Reply = unknown | (() => unknown)
let postReplies: Reply[]
let getReplies: Reply[]
function next(queue: Reply[], fallback: unknown) {
  const reply = queue.length > 1 ? queue.shift()! : queue[0] ?? fallback
  const value = typeof reply === 'function' ? (reply as () => unknown)() : reply
  return value instanceof Error || (value && typeof value === 'object' && 'status' in value && 'body' in value) ? Promise.reject(value) : Promise.resolve(value)
}

beforeEach(() => {
  vi.useFakeTimers()
  let counter = 0
  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`)
  postReplies = [sagaFixture()]
  getReplies = [sagaFixture()]
  apiClient.request.mockReset().mockImplementation((path, options) => {
    if (path === `${SAGAS}/register-sale`) return next(postReplies, sagaFixture())
    if (path.startsWith(`${SAGAS}/`)) return next(getReplies, sagaFixture())
    if (path === `/api/v1/sales/${ids.sale}`) return Promise.resolve(saleFixture({ totalCents: 25100 }))
    return Promise.reject(new Error(`unexpected ${options?.method ?? 'GET'} ${path}`))
  })
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

const setup = (onCompleted = vi.fn()) => ({ onCompleted, ...renderHook(() => useRegisterSale({ onCompleted })) })

describe('envío e idempotencia', () => {
  it('genera una clave criptográfica nueva por intención y envía el POST una vez', async () => {
    const { result } = setup()
    act(() => result.current.submit(request))
    await flush()
    expect(posts()).toHaveLength(1)
    expect(posts()[0][1]).toMatchObject({ idempotencyKey: '00000000-0000-4000-8000-000000000001', body: request })
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
  })
  it('un fallo de red ambiguo conserva la clave: reintentar la misma intención la reutiliza', async () => {
    postReplies = [failure(0, 'NETWORK_ERROR'), failure(0, 'TIMEOUT'), sagaFixture({ status: 'COMPLETED', saleId: ids.sale })]
    const { result } = setup()
    act(() => result.current.submit(request))
    await flush()
    expect(result.current.state).toMatchObject({ phase: 'submit-failed', kind: 'uncertain' })
    act(() => result.current.submit(request))
    await flush()
    act(() => result.current.submit(request))
    await flush()
    const keys = posts().map(([, options]) => options?.idempotencyKey)
    expect(keys).toEqual(Array(3).fill('00000000-0000-4000-8000-000000000001'))
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
    expect(result.current.state.phase).toBe('completed')
  })
  it('no hay reintentos automáticos tras un fallo de envío', async () => {
    postReplies = [failure(0, 'NETWORK_ERROR')]
    const { result } = setup()
    act(() => result.current.submit(request))
    await flush()
    await advance(600000)
    expect(posts()).toHaveLength(1)
    expect(result.current.state.phase).toBe('submit-failed')
  })
  it('cambiar cliente, producto o cantidad es una intención nueva con clave nueva', async () => {
    postReplies = [failure(0, 'NETWORK_ERROR')]
    const { result } = setup()
    act(() => result.current.submit(request))
    await flush()
    act(() => result.current.submit(changed))
    await flush()
    expect(posts().map(([, options]) => options?.idempotencyKey)).toEqual([
      '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
    ])
  })
  it('reordenar las mismas líneas conserva la clave', async () => {
    const a = { productId: ids.productA, quantity: 1 }
    const b = { productId: ids.productB, quantity: 2 }
    postReplies = [failure(0, 'NETWORK_ERROR')]
    const { result } = setup()
    act(() => result.current.submit({ customerId: ids.customer, lines: [a, b] }))
    await flush()
    act(() => result.current.submit({ customerId: ids.customer, lines: [b, a] }))
    await flush()
    expect(new Set(posts().map(([, options]) => options?.idempotencyKey)).size).toBe(1)
  })
  it.each([[400], [422]])('un rechazo %s sin saga se muestra sin inventar estado y la clave sigue ligada a la intención', async (status) => {
    postReplies = [failure(status, 'VALIDATION_ERROR')]
    const { result } = setup()
    act(() => result.current.submit(request))
    await flush()
    expect(result.current.state).toMatchObject({ phase: 'submit-failed', kind: 'rejected' })
    expect(result.current.pending).toBe(false)
  })
  it.each([[401, 'session'], [403, 'forbidden'], [503, 'uncertain'], [0, 'uncertain']] as const)('clasifica el HTTP %s como %s', async (status, kind) => {
    postReplies = [failure(status)]
    const { result } = setup()
    act(() => result.current.submit(request))
    await flush()
    expect(result.current.state).toMatchObject({ phase: 'submit-failed', kind })
  })
  it('una respuesta con forma inesperada se trata como resultado incierto', async () => {
    postReplies = [{ hello: 'world' }]
    const { result } = setup()
    act(() => result.current.submit(request))
    await flush()
    expect(result.current.state).toMatchObject({ phase: 'submit-failed', kind: 'uncertain' })
  })
  it('ignora un segundo envío mientras el primero está pendiente', async () => {
    const slow = deferred()
    postReplies = [() => slow.promise]
    const { result } = setup()
    act(() => result.current.submit(request))
    act(() => result.current.submit(request))
    await flush()
    expect(posts()).toHaveLength(1)
    expect(result.current.pending).toBe(true)
    slow.resolve(sagaFixture())
    await flush()
  })
})

describe('seguimiento de la saga', () => {
  it('RUNNING: consulta GET /sagas/{id} con intervalos acotados y termina en COMPLETED', async () => {
    getReplies = [sagaFixture(), sagaFixture(), completedSaga]
    const { result, onCompleted } = setup()
    act(() => result.current.submit(request))
    await flush()
    expect(result.current.state).toMatchObject({ phase: 'running', sagaId: ids.saga })
    expect(gets()).toHaveLength(0)
    await advance(1000)
    expect(gets()).toHaveLength(1)
    await advance(2000)
    expect(gets()).toHaveLength(2)
    expect(result.current.state.phase).toBe('running')
    await advance(3000)
    expect(gets()).toHaveLength(3)
    expect(result.current.state).toMatchObject({ phase: 'completed' })
    expect(posts()).toHaveLength(1)
    await advance(600000)
    expect(gets()).toHaveLength(3)
    expect(onCompleted).toHaveBeenCalledTimes(1)
    expect(onCompleted).toHaveBeenCalledWith(ids.sale)
  })
  it('COMPLETED inmediato (201) no consulta la saga y trae el total autoritativo desde Sales', async () => {
    postReplies = [completedSaga]
    const { result } = setup()
    act(() => result.current.submit(request))
    await flush()
    expect(gets()).toHaveLength(0)
    expect(result.current.state.phase).toBe('completed')
    expect(result.current.sale).toMatchObject({ status: 'ready', sale: { saleId: ids.sale, totalCents: 25100 } })
    expect(apiClient.request.mock.calls.some(([path, options]) => path === '/api/v1/sales' && options?.method === 'POST')).toBe(false)
  })
  it('si Sales no responde, la venta sigue registrada y el total queda indicado como no disponible', async () => {
    postReplies = [completedSaga]
    apiClient.request.mockImplementation((path) => path === `${SAGAS}/register-sale` ? Promise.resolve(completedSaga) : Promise.reject(failure(503)))
    const { result } = setup()
    act(() => result.current.submit(request))
    await flush()
    expect(result.current.state.phase).toBe('completed')
    expect(result.current.sale.status).toBe('error')
  })
  it('COMPENSATED: terminal, conserva failedStep, y repetir la intención usa una clave nueva', async () => {
    postReplies = [sagaFixture({ status: 'COMPENSATED', failedStep: 'reserve-stock', completedSteps: ['validate-customer'] })]
    const { result, onCompleted } = setup()
    act(() => result.current.submit(request))
    await flush()
    expect(result.current.state).toMatchObject({ phase: 'compensated', saga: { failedStep: 'reserve-stock' } })
    expect(onCompleted).not.toHaveBeenCalled()
    act(() => result.current.submit(request))
    await flush()
    expect(posts().map(([, options]) => options?.idempotencyKey)).toEqual([
      '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
    ])
  })
  it('FAILED: terminal, conserva el id y bloquea reenviar la misma intención sin revisarla', async () => {
    postReplies = [sagaFixture({ status: 'FAILED', failedStep: 'register-sale' })]
    const { result } = setup()
    act(() => result.current.submit(request))
    act(() => result.current.trackDraft(request))
    await flush()
    expect(result.current.state).toMatchObject({ phase: 'failed', saga: { sagaId: ids.saga } })
    expect(result.current.blockedReason).toMatch(/requiere atención/)
    act(() => result.current.submit(request))
    await flush()
    expect(posts()).toHaveLength(1)
    act(() => result.current.trackDraft(changed))
    expect(result.current.blockedReason).toBeUndefined()
  })
  it('el tiempo máximo deja la saga sin resolver (no fallida ni completada) y no inicia otra', async () => {
    const { result, onCompleted } = setup()
    act(() => result.current.submit(request))
    await flush()
    await advance(130000)
    expect(result.current.state).toMatchObject({ phase: 'unresolved', sagaId: ids.saga, reason: 'timeout' })
    const seen = gets().length
    expect(seen).toBeGreaterThan(3)
    expect(seen).toBeLessThan(40)
    await advance(600000)
    expect(gets()).toHaveLength(seen)
    expect(posts()).toHaveLength(1)
    expect(onCompleted).not.toHaveBeenCalled()
    expect(result.current.blockedReason).toMatch(/seguimiento/)
  })
  it('resume vuelve a observar la misma saga sin otro POST y llega a un resultado', async () => {
    const { result } = setup()
    act(() => result.current.submit(request))
    await flush()
    await advance(130000)
    expect(result.current.state.phase).toBe('unresolved')
    getReplies = [completedSaga]
    act(() => result.current.resume())
    await advance(1000)
    expect(result.current.state.phase).toBe('completed')
    expect(posts()).toHaveLength(1)
  })
  it('reenviar la misma intención con saga conocida observa esa saga en lugar de un POST nuevo', async () => {
    const { result } = setup()
    act(() => result.current.submit(request))
    await flush()
    await advance(130000)
    getReplies = [completedSaga]
    act(() => result.current.submit(request))
    await advance(1000)
    expect(posts()).toHaveLength(1)
    expect(result.current.state.phase).toBe('completed')
  })
  it('errores transitorios de consulta no cambian el resultado; tres seguidos dejan la saga sin resolver', async () => {
    getReplies = [failure(0, 'NETWORK_ERROR'), failure(503), sagaFixture(), failure(0, 'TIMEOUT'), failure(0, 'TIMEOUT'), failure(0, 'TIMEOUT')]
    const { result } = setup()
    act(() => result.current.submit(request))
    await flush()
    await advance(1000 + 2000 + 3000)
    expect(result.current.state.phase).toBe('running')
    await advance(5000 * 3)
    expect(result.current.state).toMatchObject({ phase: 'unresolved', reason: 'status-unavailable', sagaId: ids.saga })
  })
  it('COMPLETED sin saleId nunca se confirma como venta', async () => {
    postReplies = [sagaFixture({ status: 'COMPLETED' })]
    const { result, onCompleted } = setup()
    act(() => result.current.submit(request))
    await flush()
    expect(result.current.state).toMatchObject({ phase: 'unresolved', reason: 'invalid-response' })
    expect(onCompleted).not.toHaveBeenCalled()
  })
  it('al desmontar cancela la consulta en vuelo y los temporizadores, sin actualizar estado', async () => {
    const slow = deferred()
    const signals: AbortSignal[] = []
    getReplies = [() => slow.promise]
    apiClient.request.mockImplementation((path, options) => {
      if (path === `${SAGAS}/register-sale`) return Promise.resolve(sagaFixture())
      if (options?.signal) signals.push(options.signal)
      return slow.promise as Promise<unknown>
    })
    const { result, unmount, onCompleted } = setup()
    act(() => result.current.submit(request))
    await flush()
    await advance(1000)
    expect(signals).toHaveLength(1)
    unmount()
    expect(signals[0].aborted).toBe(true)
    slow.resolve(completedSaga)
    await advance(600000)
    expect(onCompleted).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('limpiar durante el seguimiento no descarta la saga pendiente; limpiar tras un resultado vuelve a idle', async () => {
    const { result } = setup()
    act(() => result.current.submit(request))
    await flush()
    act(() => result.current.clear())
    expect(result.current.state.phase).toBe('running')
    getReplies = [sagaFixture({ status: 'COMPENSATED', failedStep: 'validate-customer' })]
    await advance(1000)
    expect(result.current.state.phase).toBe('compensated')
    act(() => result.current.clear())
    expect(result.current.state.phase).toBe('idle')
  })
})
