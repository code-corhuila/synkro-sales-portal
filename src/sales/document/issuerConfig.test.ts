import { issuerEnv } from '../../test-doubles/saleDocument'
import { readIssuerConfig } from './issuerConfig'
import { SaleDocumentError } from './types'

const failureOf = (env: Record<string, string | undefined>) => {
  try { readIssuerConfig(env) } catch (error) { return error as SaleDocumentError }
  throw new Error('se esperaba un fallo de configuración')
}

it('lee el emisor de la configuración explícita', () => {
  expect(readIssuerConfig(issuerEnv())).toEqual({
    legalName: 'Comercializadora Prueba S.A.S.', taxId: '800123456-7', address: 'Carrera 10 # 20-30, Neiva',
    phone: '+57 608 871 2345', email: 'ventas@prueba.test',
  })
})

it('omite los contactos opcionales ausentes o en blanco, sin escribir undefined ni null', () => {
  const issuer = readIssuerConfig(issuerEnv({ VITE_ISSUER_ADDRESS: undefined, VITE_ISSUER_PHONE: '   ', VITE_ISSUER_EMAIL: '' }))
  expect(issuer).toEqual({ legalName: 'Comercializadora Prueba S.A.S.', taxId: '800123456-7' })
  expect(Object.keys(issuer)).toEqual(['legalName', 'taxId'])
})

it('recorta espacios y colapsa saltos de línea dentro de un valor', () => {
  expect(readIssuerConfig(issuerEnv({ VITE_ISSUER_LEGAL_NAME: '  Mi   Empresa\n S.A.S.  ' })).legalName).toBe('Mi Empresa S.A.S.')
})

it('identifica exactamente qué dato imprescindible falta: razón social y NIT', () => {
  const error = failureOf(issuerEnv({ VITE_ISSUER_LEGAL_NAME: undefined, VITE_ISSUER_TAX_ID: ' ' }))
  expect(error).toBeInstanceOf(SaleDocumentError)
  expect(error.code).toBe('ISSUER_CONFIG')
  expect(error.details).toEqual(['VITE_ISSUER_LEGAL_NAME', 'VITE_ISSUER_TAX_ID'])
  expect(error.message).toMatch(/razón social/i)
  expect(error.message).toMatch(/NIT/)
})

it('solo reporta el NIT cuando es lo único que falta', () => {
  expect(failureOf(issuerEnv({ VITE_ISSUER_TAX_ID: undefined })).details).toEqual(['VITE_ISSUER_TAX_ID'])
})

it('rechaza los valores de ejemplo de la plantilla HTML como si fueran datos reales', () => {
  expect(failureOf(issuerEnv({ VITE_ISSUER_TAX_ID: 'NIT 900.XXX.XXX-X' })).details).toEqual(['VITE_ISSUER_TAX_ID'])
  expect(failureOf(issuerEnv({ VITE_ISSUER_EMAIL: 'ventas@synkrotech.example' })).details).toEqual(['VITE_ISSUER_EMAIL'])
  expect(failureOf(issuerEnv({ VITE_ISSUER_ADDRESS: 'Calle 00 # 00-00 · Neiva, Huila' })).details).toEqual(['VITE_ISSUER_ADDRESS'])
  expect(failureOf(issuerEnv({ VITE_ISSUER_PHONE: '+57 300 000 0000' })).details).toEqual(['VITE_ISSUER_PHONE'])
})

it('no acepta un valor que supera el límite del esquema', () => {
  expect(failureOf(issuerEnv({ VITE_ISSUER_LEGAL_NAME: 'A'.repeat(2001) })).details).toEqual(['VITE_ISSUER_LEGAL_NAME'])
})
