import { useCallback, useEffect, useRef, useState } from 'react'
import { getSale } from '../api/salesApi'
import { getSaga, startRegisterSale } from '../api/workflowApi'
import type { Saga } from '../model/saga'
import { initialRegistration, isPending, registrationReducer, type RegistrationEvent, type RegistrationState, type SubmitFailureKind } from '../model/sagaMachine'
import { intentFingerprint, type RegisterSaleRequest } from '../model/saleForm'
import type { Sale } from '../model/sale'

// Bounded observation: growing waits, then a fixed one, and a hard ceiling. Past the
// ceiling the saga is "unresolved" (it may still finish), never failed or completed.
export const POLL_INTERVALS_MS = [1000, 2000, 3000, 5000]
export const MAX_OBSERVATION_MS = 120_000
const MAX_CONSECUTIVE_POLL_ERRORS = 3

export type SaleLookup = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; sale: Sale } | { status: 'error' }
type Lookup = { saleId: string; result: { status: 'ready'; sale: Sale } | { status: 'error' } }

interface Options { onCompleted?: (saleId: string) => void }
interface Intent { fingerprint: string; key: string; sagaId?: string }

function failureKind(error: unknown): { kind: SubmitFailureKind; traceId?: string } {
  const shared = error as { status?: number; body?: { traceId?: string } } | null
  const status = shared?.status
  const traceId = shared?.body?.traceId
  if (status === 401) return { kind: 'session', traceId }
  if (status === 403) return { kind: 'forbidden', traceId }
  // No answer, a gateway/server failure or a malformed body: the saga may exist, so the
  // outcome is uncertain and a retry must carry the same key.
  if (typeof status !== 'number' || status === 0 || status >= 500 || status === 408 || status === 429) return { kind: 'uncertain', traceId }
  return { kind: 'rejected', traceId }
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve() }, ms)
    const onAbort = () => { clearTimeout(timer); reject(new DOMException('aborted', 'AbortError')) }
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  })
}

// Owns one registration at a time: the idempotency intent, the saga state machine and the
// bounded observation. It starts a sale only from an explicit submit and never retries a POST by itself.
export function useRegisterSale({ onCompleted }: Options = {}) {
  const [state, setState] = useState<RegistrationState>(initialRegistration)
  // The reducer is pure: the ref holds the latest state synchronously, so two calls made before a
  // render (a double click) both see the first one's effect and cannot start two requests.
  const stateRef = useRef<RegistrationState>(initialRegistration)
  const dispatch = useCallback((event: RegistrationEvent) => {
    const next = registrationReducer(stateRef.current, event)
    if (next === stateRef.current) return
    stateRef.current = next
    setState(next)
  }, [])
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<string | null>(null)
  const intent = useRef<Intent | null>(null)
  const observer = useRef<AbortController | null>(null)
  const saleLookup = useRef<AbortController | null>(null)
  const completed = useRef(onCompleted)
  useEffect(() => { completed.current = onCompleted })

  useEffect(() => () => { observer.current?.abort(); saleLookup.current?.abort() }, [])

  const accept = useCallback((saga: Saga) => {
    if (intent.current) intent.current.sagaId = saga.sagaId
    dispatch({ type: 'saga', saga })
  }, [dispatch])

  const observe = useCallback((sagaId: string) => {
    observer.current?.abort()
    const controller = new AbortController()
    observer.current = controller
    const { signal } = controller
    const startedAt = Date.now()
    void (async () => {
      let attempt = 0
      let errors = 0
      try {
        for (;;) {
          await wait(POLL_INTERVALS_MS[Math.min(attempt, POLL_INTERVALS_MS.length - 1)], signal)
          attempt += 1
          if (Date.now() - startedAt >= MAX_OBSERVATION_MS) {
            dispatch({ type: 'unresolved', sagaId, reason: 'timeout' })
            return
          }
          try {
            const saga = await getSaga(sagaId, { signal })
            if (signal.aborted) return
            errors = 0
            accept(saga)
            if (saga.status !== 'RUNNING') return
          } catch (error) {
            if (signal.aborted) return
            errors += 1
            const status = (error as { status?: number } | null)?.status
            if (errors >= MAX_CONSECUTIVE_POLL_ERRORS || status === 401 || status === 403 || status === 404) {
              dispatch({ type: 'unresolved', sagaId, reason: 'status-unavailable' })
              return
            }
          }
        }
      } catch {
        // Aborted while waiting: unmounted or superseded.
      }
    })()
  }, [accept, dispatch])

  // Reacts to the state machine rather than to each call site, so every route to
  // "running" or "completed" (POST answer, replay, polling, resume) behaves the same.
  const phase = state.phase
  const runningId = state.phase === 'running' ? state.sagaId : undefined
  useEffect(() => {
    if (phase === 'running' && runningId) observe(runningId)
  }, [phase, runningId, observe])

  const completedSaleId = state.phase === 'completed' ? state.saga.saleId : undefined
  useEffect(() => {
    if (!completedSaleId) return
    intent.current = null
    completed.current?.(completedSaleId)
    saleLookup.current?.abort()
    const controller = new AbortController()
    saleLookup.current = controller
    getSale(completedSaleId, { signal: controller.signal }).then(
      (value) => { if (!controller.signal.aborted) setLookup({ saleId: completedSaleId, result: { status: 'ready', sale: value } }) },
      () => { if (!controller.signal.aborted) setLookup({ saleId: completedSaleId, result: { status: 'error' } }) },
    )
  }, [completedSaleId])

  const submit = useCallback((request: RegisterSaleRequest) => {
    const current = stateRef.current
    if (isPending(current)) return
    const fingerprint = intentFingerprint(request)
    // A saga that is already known is observed, never started again.
    if (current.phase === 'unresolved') { dispatch({ type: 'resume', sagaId: current.sagaId }); return }
    if (current.phase === 'failed' && intent.current?.fingerprint === fingerprint) return
    if (current.phase === 'compensated') intent.current = null // that attempt is over; the next one is a new intent
    if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, key: crypto.randomUUID() }
    setSubmitted(fingerprint)
    const { key } = intent.current
    dispatch({ type: 'submit' })
    observer.current?.abort()
    const controller = new AbortController()
    observer.current = controller
    startRegisterSale(request, { idempotencyKey: key, signal: controller.signal }).then(
      (saga) => { if (!controller.signal.aborted) accept(saga) },
      (error: unknown) => { if (!controller.signal.aborted) dispatch({ type: 'submit-error', ...failureKind(error) }) },
    )
  }, [accept, dispatch])

  const resume = useCallback(() => {
    const current = stateRef.current
    if (current.phase === 'unresolved') dispatch({ type: 'resume', sagaId: current.sagaId })
  }, [dispatch])

  const reset = useCallback(() => {
    observer.current?.abort()
    saleLookup.current?.abort()
    intent.current = null
    setLookup(null)
    setSubmitted(null)
    dispatch({ type: 'reset' })
  }, [dispatch])

  // "Limpiar" empties the form. It must not make a pending, unresolved or failed saga disappear.
  const clear = useCallback(() => {
    const { phase: current } = stateRef.current
    if (current === 'idle' || current === 'submit-failed' || current === 'completed' || current === 'compensated') reset()
  }, [reset])

  // Derived, not stored: the authoritative sale is looked up once per confirmed saleId.
  const sale: SaleLookup = !completedSaleId ? { status: 'idle' } : lookup?.saleId === completedSaleId ? lookup.result : { status: 'loading' }

  const blockedReason = state.phase === 'unresolved'
    ? 'Hay una venta en seguimiento. Consulta su estado antes de registrar otra.'
    : state.phase === 'failed' && draft !== null && draft === submitted
      ? 'Esta venta requiere atención. No la reenvíes sin revisar el caso; cambia el formulario solo si es una venta distinta.'
      : undefined

  return {
    state, sale, pending: isPending(state), blockedReason,
    submit, resume, clear, dismiss: reset,
    trackDraft: useCallback((request: RegisterSaleRequest | null) => setDraft(request ? intentFingerprint(request) : null), []),
  }
}
