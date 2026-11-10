import { customerFixture, deferred, failure, ids, productFixture } from '../../test-doubles/fixtures'
import type { Customer } from './customer'
import type { DraftRecord } from './draftJournal'
import { restoreDraft, type DraftLoaders } from './draftRestore'
import type { Product } from './product'

const recordOf = (overrides: Partial<DraftRecord> = {}): DraftRecord => ({
  customerId: ids.customer, lines: [{ productId: ids.productA, quantity: 2 }], ...overrides,
})
const teclado = productFixture() as Product
const raton = productFixture({ productId: ids.productB, name: 'Ratón óptico', priceCents: 5000, stock: 3 }) as Product

function loaders(overrides: Partial<DraftLoaders> = {}, products: Product[] = [teclado, raton]): DraftLoaders {
  return {
    loadCustomer: async () => customerFixture() as Customer,
    loadProduct: async (id) => {
      const found = products.find((product) => product.productId === id)
      if (!found) throw failure(404, 'NOT_FOUND')
      return found
    },
    ...overrides,
  }
}
const signal = () => new AbortController().signal

it('recupera cliente y líneas con los datos vigentes: el precio y el nombre vienen del servicio, no del almacenamiento', async () => {
  const fresh = { ...teclado, name: 'Teclado mecánico v2', priceCents: 9999 }
  const restored = await restoreDraft(recordOf(), loaders({}, [fresh]), signal())
  expect(restored.customer).toEqual({ customerId: ids.customer, name: 'Ana Pérez', identityDocument: '1075123456' })
  expect(restored.lines).toHaveLength(1)
  expect(restored.lines[0].product).toEqual(fresh)
  expect(restored.lines[0].quantity).toBe('2')
  expect(restored.notices).toEqual([])
})

it('conserva el orden y no duplica productos', async () => {
  const record = recordOf({ lines: [{ productId: ids.productB, quantity: 1 }, { productId: ids.productA, quantity: 4 }] })
  const restored = await restoreDraft(record, loaders(), signal())
  expect(restored.lines.map((line) => [line.product?.productId, line.quantity])).toEqual([[ids.productB, '1'], [ids.productA, '4']])
  expect(new Set(restored.lines.map((line) => line.id)).size).toBe(2)
})

it('recupera un borrador sin cliente o sin líneas', async () => {
  expect((await restoreDraft(recordOf({ customerId: null }), loaders(), signal())).customer).toBeNull()
  const noLines = await restoreDraft(recordOf({ lines: [] }), loaders(), signal())
  expect(noLines.lines).toEqual([])
  expect(noLines.customer?.customerId).toBe(ids.customer)
})

it('si el stock bajó, reduce la cantidad al disponible y lo avisa', async () => {
  const restored = await restoreDraft(recordOf({ lines: [{ productId: ids.productB, quantity: 5 }] }), loaders(), signal())
  expect(restored.lines[0].quantity).toBe('3')
  expect(restored.notices).toEqual(['Ratón óptico: solo hay 3 unidades disponibles; se ajustó la cantidad de 5 a 3.'])
})

it('usa singular cuando queda una unidad', async () => {
  const one = { ...raton, stock: 1 }
  const restored = await restoreDraft(recordOf({ lines: [{ productId: ids.productB, quantity: 2 }] }), loaders({}, [one]), signal())
  expect(restored.notices).toEqual(['Ratón óptico: solo hay 1 unidad disponible; se ajustó la cantidad de 2 a 1.'])
})

it('un producto agotado se quita con aviso', async () => {
  const out = { ...raton, stock: 0 }
  const restored = await restoreDraft(recordOf({ lines: [{ productId: ids.productB, quantity: 2 }] }), loaders({}, [out]), signal())
  expect(restored.lines).toEqual([])
  expect(restored.notices).toEqual(['Ratón óptico se quitó de la venta: está agotado.'])
})

it('un producto inactivo o inexistente se quita con aviso', async () => {
  const inactive = { ...teclado, active: false }
  const record = recordOf({ lines: [{ productId: ids.productA, quantity: 1 }, { productId: ids.productB, quantity: 1 }] })
  const restored = await restoreDraft(record, loaders({}, [inactive]), signal())
  expect(restored.lines).toEqual([])
  expect(restored.notices).toEqual([
    'Teclado mecánico se quitó de la venta: ya no está disponible.',
    'Un producto se quitó de la venta: ya no está disponible.',
  ])
})

it('un cliente inactivo o inexistente se descarta con aviso y las líneas se conservan', async () => {
  const missing = await restoreDraft(recordOf(), loaders({ loadCustomer: async () => { throw failure(404, 'NOT_FOUND') } }), signal())
  expect(missing.customer).toBeNull()
  expect(missing.lines).toHaveLength(1)
  expect(missing.notices).toEqual(['El cliente de la venta ya no está disponible. Elige otro cliente.'])
  const inactive = await restoreDraft(recordOf(), loaders({ loadCustomer: async () => customerFixture({ active: false }) as Customer }), signal())
  expect(inactive.customer).toBeNull()
  expect(inactive.notices).toEqual(['El cliente de la venta ya no está disponible. Elige otro cliente.'])
})

it('si no puede verificar algo (error distinto de 404) falla entero para poder reintentar sin perder el borrador', async () => {
  await expect(restoreDraft(recordOf(), loaders({ loadProduct: async () => { throw failure(500) } }), signal())).rejects.toMatchObject({ status: 500 })
  await expect(restoreDraft(recordOf(), loaders({ loadCustomer: async () => { throw failure(0, 'NETWORK_ERROR') } }), signal())).rejects.toMatchObject({ status: 0 })
})

it('un 401 o un 403 tampoco se toman como producto o cliente ausente', async () => {
  await expect(restoreDraft(recordOf(), loaders({ loadCustomer: async () => { throw failure(403) } }), signal())).rejects.toMatchObject({ status: 403 })
})

it('lee como máximo 4 productos a la vez', async () => {
  const lines = Array.from({ length: 12 }, (_, i) => ({ productId: `550e8400-e29b-41d4-a716-4466554402${String(i).padStart(2, '0')}`, quantity: 1 }))
  let inFlight = 0
  let peak = 0
  const gates: ReturnType<typeof deferred<Product>>[] = []
  const result = restoreDraft(recordOf({ lines }), loaders({
    loadProduct: (id) => {
      inFlight += 1; peak = Math.max(peak, inFlight)
      const gate = deferred<Product>(); gates.push(gate)
      return gate.promise.finally(() => { inFlight -= 1 }).then(() => ({ ...teclado, productId: id }))
    },
  }), signal())
  for (let guard = 0; guard < 100 && gates.filter((gate) => gate).length < 12; guard += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    gates.forEach((gate) => gate.resolve(teclado))
  }
  const restored = await result
  expect(peak).toBeLessThanOrEqual(4)
  expect(restored.lines).toHaveLength(12)
})

it('abortar la restauración la rechaza con AbortError y no deja trabajo pendiente', async () => {
  const controller = new AbortController()
  const slow = deferred<Product>()
  const promise = restoreDraft(recordOf(), loaders({ loadProduct: () => slow.promise }), controller.signal)
  controller.abort()
  slow.resolve(teclado)
  await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
})
