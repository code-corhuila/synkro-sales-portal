import { addProduct, decrementLine, removeLine, setLineQuantity, stockBadge } from './cart'
import { newLine, validateSaleForm, buildRegisterRequest, type LineDraft } from './saleForm'
import { customerFixture, ids, productFixture } from '../../test-doubles/fixtures'

const tecla = productFixture({ stock: 40 })
const raton = productFixture({ productId: ids.productB, name: 'Ratón', priceCents: 5000, stock: 3 })
const agotado = productFixture({ productId: '550e8400-e29b-41d4-a716-4466554400ff', name: 'Cable', stock: 0 })

describe('stockBadge', () => {
  it.each([
    [11, 'available', 'Disponible'],
    [10, 'low', 'Quedan 10'],
    [1, 'low', 'Quedan 1'],
    [0, 'out', 'Agotado'],
  ])('stock %i -> %s', (stock, kind, label) => {
    expect(stockBadge(stock)).toEqual({ kind, label })
  })
  it('trata un stock negativo o no entero como agotado, nunca como disponible', () => {
    expect(stockBadge(-2).kind).toBe('out')
    expect(stockBadge(Number.NaN).kind).toBe('out')
  })
})

describe('addProduct', () => {
  it('un clic agrega una unidad', () => {
    const result = addProduct([], tecla)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]).toMatchObject({ product: tecla, quantity: '1' })
    expect(result.notice).toBeUndefined()
  })
  it('los clics repetidos incrementan la misma entrada y nunca la duplican', () => {
    let lines: LineDraft[] = []
    for (let i = 0; i < 4; i++) lines = addProduct(lines, tecla).lines
    expect(lines).toHaveLength(1)
    expect(lines[0].quantity).toBe('4')
  })
  it('conserva el identificador de la línea al incrementar (la fila no se vuelve a montar)', () => {
    const first = addProduct([], tecla).lines
    const again = addProduct(first, tecla).lines
    expect(again[0].id).toBe(first[0].id)
  })
  it('un producto agotado no se puede agregar', () => {
    const result = addProduct([], agotado)
    expect(result.lines).toEqual([])
    expect(result.notice).toMatch(/agotado/i)
  })
  it('no supera el último stock observado y lo indica', () => {
    let lines: LineDraft[] = []
    for (let i = 0; i < 3; i++) lines = addProduct(lines, raton).lines
    const blocked = addProduct(lines, raton)
    expect(blocked.lines[0].quantity).toBe('3')
    expect(blocked.notice).toMatch(/3/)
  })
  it('al volver a agregar toma el stock más reciente del catálogo', () => {
    const first = addProduct([], raton).lines
    const refreshed = { ...raton, stock: 1 }
    const result = addProduct(first, refreshed)
    expect(result.lines[0].quantity).toBe('1')
    expect(result.lines[0].product).toEqual(refreshed)
    expect(result.notice).toMatch(/1/)
  })
  it('respeta el máximo de 100 líneas', () => {
    let lines: LineDraft[] = []
    for (let i = 0; i < 100; i++) {
      lines = addProduct(lines, productFixture({ productId: `550e8400-e29b-41d4-a716-${String(i).padStart(12, '0')}` })).lines
    }
    expect(lines).toHaveLength(100)
    const over = addProduct(lines, productFixture({ productId: '550e8400-e29b-41d4-a716-ffffffffffff' }))
    expect(over.lines).toHaveLength(100)
    expect(over.notice).toMatch(/100/)
  })
  it('no muta el arreglo recibido', () => {
    const lines = addProduct([], tecla).lines
    const snapshot = JSON.parse(JSON.stringify(lines))
    addProduct(lines, tecla)
    expect(lines).toEqual(snapshot)
  })
})

describe('decrementLine', () => {
  it('resta una unidad', () => {
    const lines = [{ ...newLine(), product: tecla, quantity: '3' }]
    expect(decrementLine(lines, lines[0].id)[0].quantity).toBe('2')
  })
  it('con una unidad elimina la entrada', () => {
    const lines = [{ ...newLine(), product: tecla, quantity: '1' }]
    expect(decrementLine(lines, lines[0].id)).toEqual([])
  })
  it('con una cantidad ilegible elimina en lugar de inventar un número', () => {
    const lines = [{ ...newLine(), product: tecla, quantity: 'abc' }]
    expect(decrementLine(lines, lines[0].id)).toEqual([])
  })
})

describe('removeLine', () => {
  it('quita solo la línea indicada', () => {
    const lines = addProduct(addProduct([], tecla).lines, raton).lines
    expect(removeLine(lines, lines[0].id).map((l) => l.product?.productId)).toEqual([ids.productB])
  })
})

describe('setLineQuantity', () => {
  const lines = [{ ...newLine(), product: raton, quantity: '1' }]
  it('acepta un entero dentro del stock', () => {
    const result = setLineQuantity(lines, lines[0].id, '3')
    expect(result.lines[0].quantity).toBe('3')
    expect(result.notice).toBeUndefined()
  })
  it('supera el stock: limita al stock observado e indica el límite', () => {
    const result = setLineQuantity(lines, lines[0].id, '9')
    expect(result.lines[0].quantity).toBe('3')
    expect(result.notice).toMatch(/3/)
  })
  it.each(['0', '-1', '1.5', 'abc', '1e3'])('rechaza %j sin cambiar la cantidad', (text) => {
    const result = setLineQuantity(lines, lines[0].id, text)
    expect(result.lines[0].quantity).toBe('1')
    expect(result.notice).toBeDefined()
  })
  it('permite vaciar el campo mientras se escribe, sin eliminar la línea', () => {
    const result = setLineQuantity(lines, lines[0].id, '')
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].quantity).toBe('')
  })
})

describe('el carrito produce exactamente la solicitud que el Workflow acepta', () => {
  it('una línea por producto con cantidades enteras y sin precios', () => {
    let lines: LineDraft[] = []
    lines = addProduct(lines, tecla).lines
    lines = addProduct(lines, tecla).lines
    lines = addProduct(lines, raton).lines
    const draft = { customer: customerFixture(), lines }
    expect(validateSaleForm(draft).valid).toBe(true)
    expect(buildRegisterRequest(draft)).toEqual({
      customerId: ids.customer,
      lines: [{ productId: ids.productA, quantity: 2 }, { productId: ids.productB, quantity: 1 }],
    })
  })
})
