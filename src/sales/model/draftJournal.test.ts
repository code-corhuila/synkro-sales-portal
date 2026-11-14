import { session, notifySession } from '../../test-doubles/shellSession'
import { ids } from '../../test-doubles/fixtures'
import { draftOwner, readDraft, removeDraft, writeDraft, type DraftRecord } from './draftJournal'

// eslint-disable-next-line no-restricted-globals -- Tests inspect the non-credential recovery record.
const storage = sessionStorage


const KEY = 'synkro.sales.draft.v1'
const draft: DraftRecord = { customerId: ids.customer, lines: [{ productId: ids.productA, quantity: 2 }, { productId: ids.productB, quantity: 1 }] }
const stored = () => storage.getItem(KEY)

beforeEach(() => {
  session.user.mockReturnValue({ sub: ids.user, role: 'SALESPERSON' })
  session.sessionId.mockReturnValue('s-1')
  removeDraft()
})

describe('quién es el dueño del borrador', () => {
  it('es la persona y la sesión actuales, solo para ADMIN y SALESPERSON', () => {
    expect(draftOwner()).toBe(JSON.stringify([ids.user, 's-1']))
    session.user.mockReturnValue({ sub: ids.user, role: 'INVENTORY' })
    expect(draftOwner()).toBeNull()
    session.user.mockReturnValue(null)
    expect(draftOwner()).toBeNull()
    session.user.mockReturnValue({ sub: ids.user, role: 'ADMIN' })
    session.sessionId.mockReturnValue(null)
    expect(draftOwner()).toBeNull()
  })
})

describe('guardar y recuperar', () => {
  it('recupera exactamente lo guardado para el mismo dueño', () => {
    const owner = draftOwner()!
    writeDraft(owner, draft)
    expect(readDraft(owner)).toEqual(draft)
  })
  it('guarda solo identificadores y cantidades: ningún nombre, documento, precio ni credencial', () => {
    writeDraft(draftOwner()!, draft)
    const raw = stored()!
    const parsed = JSON.parse(raw)
    expect(Object.keys(parsed).sort()).toEqual(['draft', 'owner'])
    expect(Object.keys(parsed.draft).sort()).toEqual(['customerId', 'lines'])
    expect(parsed.draft.lines.every((line: object) => Object.keys(line).sort().join() === 'productId,quantity')).toBe(true)
    expect(raw).not.toMatch(/token|password|name|document|price|email/i)
  })
  it('un borrador vacío (sin cliente y sin líneas) no se guarda y borra el anterior', () => {
    const owner = draftOwner()!
    writeDraft(owner, draft)
    writeDraft(owner, { customerId: null, lines: [] })
    expect(stored()).toBeNull()
  })
  it('puede guardar solo el cliente o solo las líneas', () => {
    const owner = draftOwner()!
    writeDraft(owner, { customerId: ids.customer, lines: [] })
    expect(readDraft(owner)).toEqual({ customerId: ids.customer, lines: [] })
    writeDraft(owner, { customerId: null, lines: draft.lines })
    expect(readDraft(owner)).toEqual({ customerId: null, lines: draft.lines })
  })
  it('sin dueño (sin sesión válida) no escribe nada', () => {
    writeDraft(null, draft)
    expect(stored()).toBeNull()
    expect(readDraft(null)).toBeNull()
  })
  it('no escribe si la sesión cambió entre medias', () => {
    const owner = draftOwner()!
    session.sessionId.mockReturnValue('s-2')
    writeDraft(owner, draft)
    expect(stored()).toBeNull()
  })
  it('removeDraft borra el registro', () => {
    writeDraft(draftOwner()!, draft)
    removeDraft()
    expect(stored()).toBeNull()
  })
})

describe('un carrito no pasa de una persona o sesión a otra', () => {
  it('otra persona no lo ve y el registro ajeno se borra', () => {
    writeDraft(draftOwner()!, draft)
    session.user.mockReturnValue({ sub: '550e8400-e29b-41d4-a716-4466554400aa', role: 'SALESPERSON' })
    expect(readDraft(draftOwner())).toBeNull()
    expect(stored()).toBeNull()
  })
  it('la misma persona con otra sesión (cerró sesión y volvió a entrar) tampoco lo ve', () => {
    writeDraft(draftOwner()!, draft)
    session.sessionId.mockReturnValue('s-2')
    expect(readDraft(draftOwner())).toBeNull()
    expect(stored()).toBeNull()
  })
  it('cerrar sesión borra el registro aunque el módulo ya no esté montado', () => {
    writeDraft(draftOwner()!, draft)
    session.user.mockReturnValue(null)
    notifySession()
    expect(stored()).toBeNull()
  })
  it('un cambio de sesión que no cambia al dueño no lo borra', () => {
    writeDraft(draftOwner()!, draft)
    notifySession()
    expect(stored()).not.toBeNull()
  })
})

describe('registros dañados', () => {
  const owner = () => draftOwner()!
  const put = (value: unknown) => storage.setItem(KEY, typeof value === 'string' ? value : JSON.stringify(value))
  it.each([
    ['JSON ilegible', '{no'],
    ['sin borrador', { owner: JSON.stringify([ids.user, 's-1']) }],
    ['cliente que no es UUID', { draft: { customerId: 'abc', lines: [] } }],
    ['producto que no es UUID', { draft: { customerId: null, lines: [{ productId: 'x', quantity: 1 }] } }],
    ['cantidad cero', { draft: { customerId: null, lines: [{ productId: ids.productA, quantity: 0 }] } }],
    ['cantidad decimal', { draft: { customerId: null, lines: [{ productId: ids.productA, quantity: 1.5 }] } }],
    ['cantidad en texto', { draft: { customerId: null, lines: [{ productId: ids.productA, quantity: '2' }] } }],
    ['producto repetido', { draft: { customerId: null, lines: [{ productId: ids.productA, quantity: 1 }, { productId: ids.productA, quantity: 2 }] } }],
    ['más de 100 líneas', { draft: { customerId: null, lines: Array.from({ length: 101 }, (_, i) => ({ productId: `550e8400-e29b-41d4-a716-${String(i).padStart(12, '0')}`, quantity: 1 })) } }],
    ['propiedad extra en la línea', { draft: { customerId: null, lines: [{ productId: ids.productA, quantity: 1, name: 'Teclado' }] } }],
  ])('descarta %s sin lanzar y lo elimina', (_name, body) => {
    put(typeof body === 'string' ? body : { owner: owner(), ...body })
    expect(readDraft(owner())).toBeNull()
    expect(stored()).toBeNull()
  })
  it('un almacenamiento que falla no rompe la venta: no recupera nada', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(readDraft(owner())).toBeNull()
    spy.mockRestore()
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(() => writeDraft(owner(), draft)).not.toThrow()
    set.mockRestore()
  })
})
