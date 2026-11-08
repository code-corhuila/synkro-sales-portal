import { optionalText } from './text'
import { SaleDocumentError, type SaleDocumentIssuer } from './types'

// The issuer is explicit configuration of the portal build (VITE_ISSUER_*), never domain data and never
// a placeholder: no service owns it and the sale model has no issuer. Legal name and NIT are
// indispensable on a document delivered to a customer; the contacts are optional and omitted when absent.
const FIELDS = [
  { env: 'VITE_ISSUER_LEGAL_NAME', label: 'razón social', prop: 'legalName', required: true },
  { env: 'VITE_ISSUER_TAX_ID', label: 'NIT', prop: 'taxId', required: true },
  { env: 'VITE_ISSUER_ADDRESS', label: 'dirección', prop: 'address', required: false },
  { env: 'VITE_ISSUER_PHONE', label: 'teléfono', prop: 'phone', required: false },
  { env: 'VITE_ISSUER_EMAIL', label: 'correo electrónico', prop: 'email', required: false },
] as const

const MAX_LENGTH = 2000
// What the reference template shipped as demo values: masked NIT, reserved ".example" addresses and all-zero numbers.
const PLACEHOLDER = /x{3,}|\.example\b|\bcalle 00\b|(?:^|\D)0{3}\s?0{4}(?:\D|$)/i

// Each variable is named literally so the bundler inlines exactly these five at build time and nothing else of the build environment.
const buildEnv = (): Record<string, string | undefined> => ({
  VITE_ISSUER_LEGAL_NAME: import.meta.env.VITE_ISSUER_LEGAL_NAME,
  VITE_ISSUER_TAX_ID: import.meta.env.VITE_ISSUER_TAX_ID,
  VITE_ISSUER_ADDRESS: import.meta.env.VITE_ISSUER_ADDRESS,
  VITE_ISSUER_PHONE: import.meta.env.VITE_ISSUER_PHONE,
  VITE_ISSUER_EMAIL: import.meta.env.VITE_ISSUER_EMAIL,
})

export function readIssuerConfig(env: Record<string, string | undefined> = buildEnv()): SaleDocumentIssuer {
  const issuer: Partial<Record<(typeof FIELDS)[number]['prop'], string>> = {}
  const missing: (typeof FIELDS)[number][] = []
  const invalid: (typeof FIELDS)[number][] = []
  for (const field of FIELDS) {
    const raw = env[field.env]
    const value = optionalText(typeof raw === 'string' ? raw : undefined)
    if (value === undefined) {
      if (field.required) missing.push(field)
    } else if (value.length > MAX_LENGTH || PLACEHOLDER.test(value)) {
      invalid.push(field)
    } else {
      issuer[field.prop] = value
    }
  }
  if (missing.length || invalid.length) {
    const name = (field: (typeof FIELDS)[number]) => `${field.label} (${field.env})`
    const parts = [
      missing.length && `Falta configurar los datos del emisor: ${missing.map(name).join(', ')}.`,
      invalid.length && `Dato del emisor no válido o de ejemplo: ${invalid.map(name).join(', ')}.`,
    ].filter(Boolean)
    // `details` lists the variables in the order of FIELDS, whichever of the two groups they belong to.
    const details = FIELDS.filter((field) => missing.includes(field) || invalid.includes(field)).map((field) => field.env)
    throw new SaleDocumentError('ISSUER_CONFIG', parts.join(' '), { details })
  }
  return issuer as SaleDocumentIssuer
}
