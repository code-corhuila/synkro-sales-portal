import { isUuid } from './identifier'

// Field names and enums are the SagaResponse OpenAPI contract (synkro-workflow 2.2.0).
export type SagaStatus = 'RUNNING' | 'COMPLETED' | 'COMPENSATED' | 'FAILED'
export type SagaStep = 'validate-customer' | 'reserve-stock' | 'register-sale'
// Who resumes a RUNNING saga that stopped: the Workflow later, or a responsible person.
export type SagaRecovery = 'AUTOMATIC_RETRY' | 'OPERATOR_REQUIRED'

export interface Saga {
  sagaId: string
  sagaType: 'register-sale'
  status: SagaStatus
  recovery?: SagaRecovery
  completedSteps: SagaStep[]
  failedStep?: SagaStep
  saleId?: string
  createdAt: string
  updatedAt: string
}

export const STEP_LABELS: Record<SagaStep, string> = {
  'validate-customer': 'validación del cliente',
  'reserve-stock': 'reserva de stock',
  'register-sale': 'registro de la venta',
}

const STATUSES: readonly string[] = ['RUNNING', 'COMPLETED', 'COMPENSATED', 'FAILED']
const RECOVERIES: readonly string[] = ['AUTOMATIC_RETRY', 'OPERATOR_REQUIRED']
const isStep = (value: unknown): value is SagaStep => typeof value === 'string' && value in STEP_LABELS
const isAbsent = (value: unknown) => value === undefined || value === null

// The portal trusts the contract, but never acts on a body that is not one: a malformed
// answer must not become a success, a failure or a new saga.
export function parseSaga(value: unknown): Saga {
  const invalid = () => new Error('Respuesta de saga inválida')
  if (!value || typeof value !== 'object') throw invalid()
  const body = value as Record<string, unknown>
  if (typeof body.sagaId !== 'string' || !isUuid(body.sagaId)) throw invalid()
  if (body.sagaType !== 'register-sale') throw invalid()
  if (typeof body.status !== 'string' || !STATUSES.includes(body.status)) throw invalid()
  if (!isAbsent(body.recovery) && (typeof body.recovery !== 'string' || !RECOVERIES.includes(body.recovery))) throw invalid()
  if (!Array.isArray(body.completedSteps) || !body.completedSteps.every(isStep)) throw invalid()
  if (body.failedStep !== undefined && body.failedStep !== null && !isStep(body.failedStep)) throw invalid()
  if (body.saleId !== undefined && body.saleId !== null && (typeof body.saleId !== 'string' || !isUuid(body.saleId))) throw invalid()
  return {
    sagaId: body.sagaId,
    sagaType: 'register-sale',
    status: body.status as SagaStatus,
    ...(body.recovery ? { recovery: body.recovery as SagaRecovery } : {}),
    completedSteps: body.completedSteps as SagaStep[],
    ...(body.failedStep ? { failedStep: body.failedStep as SagaStep } : {}),
    ...(body.saleId ? { saleId: body.saleId as string } : {}),
    createdAt: String(body.createdAt ?? ''),
    updatedAt: String(body.updatedAt ?? ''),
  }
}
