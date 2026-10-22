import type { Saga } from './saga'

export type SubmitFailureKind = 'uncertain' | 'rejected' | 'forbidden' | 'session'
export type UnresolvedReason = 'timeout' | 'status-unavailable' | 'invalid-response'

// idle → submitting → running → one of completed | compensated | failed.
// `unresolved` is not an outcome: the saga may still be running, so the UI says exactly that.
export type RegistrationState =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'submit-failed'; kind: SubmitFailureKind; traceId?: string }
  | { phase: 'running'; sagaId: string; saga?: Saga }
  | { phase: 'unresolved'; sagaId: string; reason: UnresolvedReason }
  | { phase: 'completed'; saga: Saga & { saleId: string } }
  | { phase: 'compensated'; saga: Saga }
  | { phase: 'failed'; saga: Saga }

export type RegistrationEvent =
  | { type: 'submit' }
  | { type: 'submit-error'; kind: SubmitFailureKind; traceId?: string }
  | { type: 'saga'; saga: Saga }
  | { type: 'unresolved'; sagaId: string; reason: UnresolvedReason }
  | { type: 'resume'; sagaId: string }
  | { type: 'reset' }

export const initialRegistration: RegistrationState = { phase: 'idle' }

// A request or an observation is in flight: the form is locked and a second submit is impossible.
export const isPending = (state: RegistrationState) => state.phase === 'submitting' || state.phase === 'running'

const knownId = (state: RegistrationState) => state.phase === 'running' || state.phase === 'unresolved' ? state.sagaId : undefined

export function registrationReducer(state: RegistrationState, event: RegistrationEvent): RegistrationState {
  switch (event.type) {
    case 'reset':
      return initialRegistration
    case 'submit':
      return isPending(state) || state.phase === 'unresolved' ? state : { phase: 'submitting' }
    case 'submit-error':
      return state.phase === 'submitting' ? { phase: 'submit-failed', kind: event.kind, traceId: event.traceId } : state
    case 'resume':
      return state.phase === 'unresolved' && state.sagaId === event.sagaId ? { phase: 'running', sagaId: event.sagaId } : state
    case 'unresolved':
      return state.phase === 'running' && state.sagaId === event.sagaId ? { phase: 'unresolved', sagaId: event.sagaId, reason: event.reason } : state
    case 'saga': {
      const { saga } = event
      const open = state.phase === 'submitting' || state.phase === 'running' || state.phase === 'unresolved'
      if (!open) return state // a terminal outcome is never rewritten by a late answer
      const current = knownId(state)
      if (current && current !== saga.sagaId) return state
      switch (saga.status) {
        case 'RUNNING':
          return { phase: 'running', sagaId: saga.sagaId, saga }
        case 'COMPLETED':
          return saga.saleId
            ? { phase: 'completed', saga: { ...saga, saleId: saga.saleId } }
            : { phase: 'unresolved', sagaId: saga.sagaId, reason: 'invalid-response' }
        case 'COMPENSATED':
          return { phase: 'compensated', saga }
        case 'FAILED':
          return { phase: 'failed', saga }
      }
    }
  }
}
