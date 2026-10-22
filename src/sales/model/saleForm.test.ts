import { buildRegisterRequest, estimateTotal, intentFingerprint, validateSaleForm, newLine, MAX_LINES, type SaleDraft } from './saleForm'
import { customerFixture, ids, productFixture } from '../../test-doubles/fixtures'

const customer = customerFixture()
const productA = productFixture()
const productB = productFixture({ productId: ids.productB, name: 'Ratón', priceCents: 5000 })
const line = (product: typeof productA | null, quantity: string) => ({ ...newLine(), product, quantity })
const draft = (overrides: Partial<SaleDraft> = {}): SaleDraft => ({ customer, lines: [line(productA, '2')], ...overrides })

describe('validateSaleForm', () => {
  it('acepta una venta con cliente, producto y cantidad entera positiva', () => {
    expect(validateSaleForm(draft()).valid).toBe(true)
  })
  it('exige cliente', () => {
    const result = validateSaleForm(draft({ customer: null }))
    expect(result.valid).toBe(false)
    expect(result.customer).toBe('Selecciona un cliente.')
  })
  it('exige producto en cada línea', () => {
    const lines = [line(null, '1')]
    expect(validateSaleForm(draft({ lines })).lines[lines[0].id].product).toBe('Selecciona un producto.')
  })
  it.each(['', '0', '-1', '1.5', 'abc', '1e3', ' ', '9007199254740993'])('rechaza la cantidad %j', (quantity) => {
    const lines = [line(productA, quantity)]
    const result = validateSaleForm(draft({ lines }))
    expect(result.valid).toBe(false)
    expect(result.lines[lines[0].id].quantity).toBe('Ingresa una cantidad entera mayor que cero.')
  })
  it('exige al menos una línea', () => {
    const result = validateSaleForm(draft({ lines: [] }))
    expect(result.valid).toBe(false)
    expect(result.form).toBe('Agrega al menos una línea.')
  })
  it('acepta 100 líneas y rechaza 101', () => {
    const many = (count: number) => Array.from({ length: count }, (_, index) =>
      line(productFixture({ productId: `550e8400-e29b-41d4-a716-${String(index).padStart(12, '0')}` }), '1'))
    expect(MAX_LINES).toBe(100)
    expect(validateSaleForm(draft({ lines: many(100) })).valid).toBe(true)
    const over = validateSaleForm(draft({ lines: many(101) }))
    expect(over.valid).toBe(false)
    expect(over.form).toBe('Una venta admite hasta 100 líneas.')
  })
  it('rechaza el mismo producto en dos líneas', () => {
    const lines = [line(productA, '1'), line(productA, '3')]
    expect(validateSaleForm(draft({ lines })).lines[lines[1].id].product).toBe('Este producto ya está en otra línea.')
  })
})

describe('buildRegisterRequest', () => {
  it('envía solo customerId y líneas con productId y cantidad numérica', () => {
    const request = buildRegisterRequest(draft({ lines: [line(productA, '2'), line(productB, ' 3 ')] }))
    expect(request).toEqual({
      customerId: ids.customer,
      lines: [{ productId: ids.productA, quantity: 2 }, { productId: ids.productB, quantity: 3 }],
    })
    expect(JSON.stringify(request)).not.toMatch(/price|subtotal|total|createdBy|saleId|name/i)
  })
  it('devuelve null mientras el borrador es inválido', () => {
    expect(buildRegisterRequest(draft({ customer: null }))).toBeNull()
    expect(buildRegisterRequest(draft({ lines: [line(productA, '0')] }))).toBeNull()
  })
})

describe('estimateTotal', () => {
  it('suma precio de catálogo por cantidad con enteros exactos', () => {
    expect(estimateTotal(draft({ lines: [line(productA, '2'), line(productB, '3')] }))).toBe(12550 * 2 + 5000 * 3)
  })
  it('no estima con líneas incompletas o cantidades inválidas', () => {
    expect(estimateTotal(draft({ lines: [line(productA, '2'), line(null, '1')] }))).toBeNull()
    expect(estimateTotal(draft({ lines: [line(productA, 'x')] }))).toBeNull()
  })
  it('no muestra un importe fuera del rango seguro', () => {
    expect(estimateTotal(draft({ lines: [line(productFixture({ priceCents: Number.MAX_SAFE_INTEGER }), '2')] }))).toBeNull()
  })
})

describe('intentFingerprint', () => {
  const request = (quantity: number) => ({ customerId: ids.customer, lines: [{ productId: ids.productA, quantity }] })
  it('es estable para la misma intención y cambia con cliente, producto o cantidad', () => {
    expect(intentFingerprint(request(2))).toBe(intentFingerprint(request(2)))
    expect(intentFingerprint(request(2))).not.toBe(intentFingerprint(request(3)))
    expect(intentFingerprint(request(2))).not.toBe(intentFingerprint({ ...request(2), customerId: ids.sale }))
  })
  it('no cambia al reordenar líneas: reordenar no es una intención nueva', () => {
    const a = { productId: ids.productA, quantity: 1 }
    const b = { productId: ids.productB, quantity: 4 }
    expect(intentFingerprint({ customerId: ids.customer, lines: [a, b] })).toBe(intentFingerprint({ customerId: ids.customer, lines: [b, a] }))
  })
})
