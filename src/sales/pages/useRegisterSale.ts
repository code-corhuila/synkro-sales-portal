import { useCallback, useEffect, useRef, useState } from 'react'
import { getSale } from '../api/salesApi'
import { getSaga, startRegisterSale } from '../api/workflowApi'
import type { Saga } from '../model/saga'
import { initialRegistration, isPending, registrationReducer, type RegistrationEvent, type RegistrationState, type SubmitFailureKind } from '../model/sagaMachine'
import { intentFingerprint, type RegisterSaleRequest } from '../model/saleForm'
import type { Sale } from '../model/sale'
import { session } from 'shell/session'
import { INTENT_TTL_MS, readIntent, recoveryOwner, removeIntent, writeIntent, type Intent } from '../model/intentJournal'

// Bounded observation: growing waits, then a fixed one, and a hard ceiling. Past the
// ceiling the saga is "unresolved" (it may still finish), never failed or completed.
export const POLL_INTERVALS_MS = [1000, 2000, 3000, 5000]
export const MAX_OBSERVATION_MS = 120_000
const MAX_CONSECUTIVE_POLL_ERRORS = 3

export type SaleLookup = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; sale: Sale } | { status: 'error' }
type Lookup = { saleId: string; result: { status: 'ready'; sale: Sale } | { status: 'error' } }

interface Options { onCompleted?: (saleId: string) => void }

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
  const [recovery] = useState(() => {
    const owner = recoveryOwner()
    try { return { owner, intent: readIntent(owner), error: false } }
    catch { return { owner, intent: null, error: true } }
  })
  const restored: RegistrationState = recovery.intent?.sagaId
    ? { phase: 'unresolved', sagaId: recovery.intent.sagaId, reason: 'status-unavailable' }
    : recovery.intent ? { phase: 'submit-failed', kind: 'uncertain' } : initialRegistration
  const [state, setState] = useState<RegistrationState>(restored)
  const [storageError, setStorageError] = useState(recovery.error)
  const [expired, setExpired] = useState(() => Boolean(recovery.intent && recovery.intent.expiresAt <= Date.now() && !recovery.intent.sagaId))
  const [sessionChanged, setSessionChanged] = useState(false)
  const sameSession = useCallback(() => Boolean(recovery.owner && recoveryOwner() === recovery.owner), [recovery.owner])
  // The reducer is pure: the ref holds the latest state synchronously, so two calls made before a
  // render (a double click) both see the first one's effect and cannot start two requests.
  const stateRef = useRef<RegistrationState>(restored)
  const dispatch = useCallback((event: RegistrationEvent) => {
    const next = registrationReducer(stateRef.current, event)
    if (next === stateRef.current) return
    stateRef.current = next
    setState(next)
  }, [])
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<string | null>(recovery.intent?.fingerprint ?? null)
  const intent = useRef<Intent | null>(recovery.intent)
  const observer = useRef<AbortController | null>(null)
  const saleLookup = useRef<AbortController | null>(null)
  const completed = useRef(onCompleted)
  useEffect(() => { completed.current = onCompleted })

  useEffect(() => () => { observer.current?.abort(); saleLookup.current?.abort() }, [])

  useEffect(() => session.subscribe?.(() => {
    if (sameSession()) return
    observer.current?.abort()
    saleLookup.current?.abort()
    intent.current = null
    try { removeIntent() } catch { setStorageError(true) }
    setSessionChanged(true)
    setLookup(null)
    setSubmitted(null)
    dispatch({ type: 'reset' })
  }), [dispatch, sameSession])

  const accept = useCallback((saga: Saga) => {
    if (!sameSession()) return
    if (intent.current) {
      intent.current.sagaId = saga.sagaId
      try { writeIntent(recovery.owner!, intent.current) } catch { setStorageError(true) }
    }
    dispatch({ type: 'saga', saga })
    if (saga.status === 'COMPLETED' && saga.saleId || saga.status === 'COMPENSATED') {
      try { removeIntent() } catch { setStorageError(true) }
      intent.current = null
    }
  }, [dispatch, recovery.owner, sameSession])

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
            if (signal.aborted || !sameSession()) return
            errors = 0
            accept(saga)
            if (saga.status !== 'RUNNING') return
          } catch (error) {
            if (signal.aborted || !sameSession()) return
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
  }, [accept, dispatch, sameSession])

  // Reacts to the state machine rather than to each call site, so every route to
  // "running" or "completed" (POST answer, replay, polling, resume) behaves the same.
  const phase = state.phase
  const runningId = state.phase === 'running' ? state.sagaId : undefined
  useEffect(() => {
    if (phase === 'running' && runningId) observe(runningId)
  }, [phase, runningId, observe])

  const completedSaleId = state.phase === 'completed' ? state.saga.saleId : undefined
  useEffect(() => {
    if (!completedSaleId || !sameSession()) return
    intent.current = null
    completed.current?.(completedSaleId)
    saleLookup.current?.abort()
    const controller = new AbortController()
    saleLookup.current = controller
    getSale(completedSaleId, { signal: controller.signal }).then(
      (value) => { if (!controller.signal.aborted) setLookup({ saleId: completedSaleId, result: { status: 'ready', sale: value } }) },
      () => { if (!controller.signal.aborted) setLookup({ saleId: completedSaleId, result: { status: 'error' } }) },
    )
  }, [completedSaleId, sameSession])

  const submit = useCallback((request: RegisterSaleRequest) => {
    const current = stateRef.current
    if (isPending(current) || !sameSession() || storageError) return
    const fingerprint = intentFingerprint(request)
    // A saga that is already known is observed, never started again.
    if (current.phase === 'unresolved') { dispatch({ type: 'resume', sagaId: current.sagaId }); return }
    if (intent.current && intent.current.expiresAt <= Date.now()) { setExpired(true); return }
    if (intent.current && intent.current.fingerprint !== fingerprint) return
    if (current.phase === 'failed' && intent.current?.fingerprint === fingerprint) return
    if (current.phase === 'compensated') intent.current = null // that attempt is over; the next one is a new intent
    if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, key: crypto.randomUUID(), expiresAt: Date.now() + INTENT_TTL_MS }
    try { writeIntent(recovery.owner!, intent.current) }
    catch { setStorageError(true); return }
    setSubmitted(fingerprint)
    const { key } = intent.current
    dispatch({ type: 'submit' })
    observer.current?.abort()
    const controller = new AbortController()
    observer.current = controller
    startRegisterSale(request, { idempotencyKey: key, signal: controller.signal }).then(
      (saga) => { if (!controller.signal.aborted && sameSession()) accept(saga) },
      (error: unknown) => {
        if (controller.signal.aborted || !sameSession()) return
        const failure = failureKind(error)
        if (failure.kind !== 'uncertain') {
          try { removeIntent() } catch { setStorageError(true) }
          intent.current = null
        }
        dispatch({ type: 'submit-error', ...failure })
      },
    )
  }, [accept, dispatch, recovery.owner, sameSession, storageError])

  const resume = useCallback(() => {
    const current = stateRef.current
    if (sameSession() && current.phase === 'unresolved') dispatch({ type: 'resume', sagaId: current.sagaId })
  }, [dispatch, sameSession])

  const reset = useCallback(() => {
    if (intent.current) return
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

  const blockedReason = !recovery.owner || sessionChanged
    ? 'El Host debe ofrecer el contrato de sesión para registrar ventas de forma segura.'
    : storageError ? 'No se pudo guardar la recuperación de la venta. Revisa el almacenamiento antes de continuar.'
    : expired
      ? 'El plazo de reintento venció. Un responsable debe conciliar esta venta antes de iniciar otra.'
    : state.phase === 'submit-failed' && state.kind === 'uncertain' && draft !== submitted
      ? 'Hay un envío sin confirmar. Reconstruye el mismo cliente, productos y cantidades para reintentarlo con su clave original.'
    : state.phase === 'unresolved'
    ? 'Hay una venta en seguimiento. Consulta su estado antes de registrar otra.'
    : state.phase === 'failed'
      ? 'Esta venta requiere atención. No la reenvíes sin revisar el caso con un responsable.'
      : undefined

  return {
    state, sale, pending: isPending(state), blockedReason,
    submit, resume, clear, dismiss: reset,
    trackDraft: useCallback((request: RegisterSaleRequest | null) => setDraft(request ? intentFingerprint(request) : null), []),
  }
}
