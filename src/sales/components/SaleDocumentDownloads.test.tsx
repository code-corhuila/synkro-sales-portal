import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { customerFixture, deferred, failure, ids, pageOf, productFixture, saleFixture } from '../../test-doubles/fixtures'
import { issuerEnv } from '../../test-doubles/saleDocument'
import { apiClient } from '../../test-doubles/shellApiClient'
import { session } from '../../test-doubles/shellSession'
import { SaleDocumentError } from '../document/types'
import { renderSaleDocument } from '../document/renderSaleDocument'
import { downloadBlob } from '../export/downloadBlob'
import { SaleDocumentDownloads } from './SaleDocumentDownloads'

vi.mock('../export/downloadBlob', () => ({ downloadBlob: vi.fn() }))
vi.mock('../document/renderSaleDocument', () => ({ renderSaleDocument: vi.fn() }))

const render_ = vi.mocked(renderSaleDocument)
const save = vi.mocked(downloadBlob)
const otherSale = '550e8400-e29b-41d4-a716-446655449999'

function serve(overrides: Partial<Record<'sale' | 'customer' | 'product' | 'categories', () => Promise<unknown>>> = {}) {
  apiClient.request.mockReset().mockImplementation((path) => {
    if (path === '/api/v1/products/categories') return (overrides.categories ?? (() => Promise.resolve(pageOf([{ categoryId: ids.category, name: 'Periféricos', active: true }]))))()
    if (path.startsWith('/api/v1/sales/')) return (overrides.sale ?? (() => Promise.resolve(saleFixture({ saleId: path.split('/').pop()! }))))()
    if (path.startsWith('/api/v1/customers/')) return (overrides.customer ?? (() => Promise.resolve(customerFixture())))()
    if (path.startsWith('/api/v1/products/')) return (overrides.product ?? (() => Promise.resolve(productFixture())))()
    return Promise.reject(new Error(`unexpected ${path}`))
  })
}
const as = (role: string | null) => session.user.mockReturnValue(role ? { sub: ids.user, role } : null)
const saleCalls = () => apiClient.request.mock.calls.filter(([path]) => path.startsWith('/api/v1/sales/'))
const pdf = () => screen.getByRole('button', { name: 'Descargar PDF' })
const xml = () => screen.getByRole('button', { name: 'Descargar XML' })

beforeEach(() => {
  for (const [key, value] of Object.entries(issuerEnv())) vi.stubEnv(key, value)
  save.mockReset()
  render_.mockReset().mockImplementation(async (kind, model) => ({ blob: new Blob([kind], { type: kind === 'pdf' ? 'application/pdf' : 'application/xml' }), fileName: `comprobante-venta-${model.saleId}.${kind}` }))
  serve()
  as('SALESPERSON')
})
afterEach(() => vi.unstubAllEnvs())

describe('visibilidad por rol (la autorización real sigue en el servidor)', () => {
  it.each(['ADMIN', 'SALESPERSON'])('%s ve las dos descargas', (role) => {
    as(role)
    render(<SaleDocumentDownloads saleId={ids.sale} />)
    expect(pdf()).toBeEnabled()
    expect(xml()).toBeEnabled()
    expect(screen.getByRole('region', { name: 'Documento de la venta' })).toBeVisible()
  })

  it.each(['INVENTORY', 'SERVICE', 'OTRO', null])('el rol %s no obtiene acceso por esta función', (role) => {
    as(role)
    render(<SaleDocumentDownloads saleId={ids.sale} />)
    expect(screen.queryByRole('button', { name: /Descargar/ })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Documento de la venta' })).toBeNull()
  })

  it('aclara que es un comprobante comercial y no una factura electrónica', () => {
    render(<SaleDocumentDownloads saleId={ids.sale} />)
    expect(screen.getByText(/comprobante de venta de alcance comercial/i)).toBeVisible()
    expect(screen.getByText(/no es una factura electrónica/i)).toBeVisible()
  })
})

describe('descarga', () => {
  it('prepara, deshabilita ambas acciones, descarga una sola vez y lo anuncia', async () => {
    const pending = deferred()
    serve({ sale: () => pending.promise })
    render(<SaleDocumentDownloads saleId={ids.sale} />)
    await userEvent.setup().click(pdf())
    expect(screen.getByRole('status')).toHaveTextContent('Preparando PDF…')
    expect(pdf()).toBeDisabled()
    expect(xml()).toBeDisabled()
    expect(pdf()).toHaveAttribute('aria-busy', 'true')
    pending.resolve(saleFixture())
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    const [blob, fileName] = save.mock.calls[0]
    expect(fileName).toBe(`comprobante-venta-${ids.sale}.pdf`)
    expect(blob.type).toBe('application/pdf')
    expect(await screen.findByText('PDF descargado.')).toBeVisible()
    expect(pdf()).toBeEnabled()
    expect(xml()).toBeEnabled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('descarga el XML con su tipo y nombre', async () => {
    render(<SaleDocumentDownloads saleId={ids.sale} />)
    await userEvent.setup().click(xml())
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save.mock.calls[0][1]).toBe(`comprobante-venta-${ids.sale}.xml`)
    expect(save.mock.calls[0][0].type).toBe('application/xml')
    expect(await screen.findByText('XML descargado.')).toBeVisible()
  })

  it('el PDF y el XML se construyen con el mismo modelo del mismo documento', async () => {
    render(<SaleDocumentDownloads saleId={ids.sale} />)
    const user = userEvent.setup()
    await user.click(pdf())
    await screen.findByText('PDF descargado.')
    await user.click(xml())
    await screen.findByText('XML descargado.')
    const [first, second] = render_.mock.calls.map(([, model]) => model)
    expect({ ...first, generatedAt: '' }).toEqual({ ...second, generatedAt: '' })
  })

  it('un doble clic accidental no duplica la preparación ni la descarga', async () => {
    const pending = deferred()
    serve({ sale: () => pending.promise })
    render(<SaleDocumentDownloads saleId={ids.sale} />)
    const button = pdf()
    act(() => { button.click(); button.click() })
    pending.resolve(saleFixture())
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(saleCalls()).toHaveLength(1)
    expect(render_).toHaveBeenCalledTimes(1)
  })

  it('no permite pedir el XML mientras se prepara el PDF', async () => {
    const pending = deferred()
    serve({ sale: () => pending.promise })
    render(<SaleDocumentDownloads saleId={ids.sale} />)
    await userEvent.setup().click(pdf())
    act(() => { xml().click() })
    pending.resolve(saleFixture())
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(render_.mock.calls.map(([kind]) => kind)).toEqual(['pdf'])
  })

  it('permite descargar de nuevo después de un éxito', async () => {
    render(<SaleDocumentDownloads saleId={ids.sale} />)
    const user = userEvent.setup()
    await user.click(pdf())
    await screen.findByText('PDF descargado.')
    await user.click(pdf())
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  })

  it('usa solo lecturas GET a través del cliente del Host', async () => {
    render(<SaleDocumentDownloads saleId={ids.sale} />)
    await userEvent.setup().click(pdf())
    await screen.findByText('PDF descargado.')
    expect(apiClient.request.mock.calls.every(([, options]) => !options?.method && !options?.body && !options?.headers)).toBe(true)
  })
})

describe('errores y reintento', () => {
  it('un fallo transitorio muestra la alerta con referencia y permite reintentar hasta lograrlo', async () => {
    let attempts = 0
    serve({ sale: () => (attempts += 1) === 1 ? Promise.reject(failure(500)) : Promise.resolve(saleFixture()) })
    render(<SaleDocumentDownloads saleId={ids.sale} />)
    const user = userEvent.setup()
    await user.click(pdf())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No se pudo preparar el documento')
    expect(alert).toHaveTextContent('Referencia: trace-example')
    expect(alert).not.toHaveTextContent('Raw English backend failure')
    expect(save).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(render_.mock.calls[0][0]).toBe('pdf')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(await screen.findByText('PDF descargado.')).toBeVisible()
  })

  it('reintentar repite el mismo formato que falló', async () => {
    let attempts = 0
    serve({ sale: () => (attempts += 1) === 1 ? Promise.reject({ status: 0 }) : Promise.resolve(saleFixture()) })
    render(<SaleDocumentDownloads saleId={ids.sale} />)
    const user = userEvent.setup()
    await user.click(xml())
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(render_).toHaveBeenCalledWith('xml', expect.anything()))
  })

  it('un fallo al generar el archivo ofrece reintento y no descarga nada', async () => {
    render_.mockRejectedValueOnce(new SaleDocumentError('GENERATION_FAILED', 'x'))
    render(<SaleDocumentDownloads saleId={ids.sale} />)
    const user = userEvent.setup()
    await user.click(pdf())
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo generar el archivo')
    expect(save).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
  })

  it('una excepción inesperada también se presenta como fallo de generación reintentable', async () => {
    render_.mockRejectedValueOnce(new Error('boom'))
    render(<SaleDocumentDownloads saleId={ids.sale} />)
    await userEvent.setup().click(pdf())
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo generar el archivo')
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeVisible()
  })

  it('401: sesión finalizada, sin reintento automático ni descarga', async () => {
    serve({ sale: () => Promise.reject(failure(401)) })
    render(<SaleDocumentDownloads saleId={ids.sale} />)
    await userEvent.setup().click(pdf())
    expect(await screen.findByRole('alert')).toHaveTextContent('La sesión ha finalizado')
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
    expect(saleCalls()).toHaveLength(1)
    expect(save).not.toHaveBeenCalled()
  })

  it('403: venta ajena o rol sin acceso; no revela datos ni consulta otros servicios', async () => {
    serve({ sale: () => Promise.reject(failure(403, 'FORBIDDEN')) })
    render(<SaleDocumentDownloads saleId={ids.sale} />)
    await userEvent.setup().click(xml())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No tienes permiso para descargar esta venta.')
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
    expect(apiClient.request.mock.calls.map(([path]) => path)).toEqual([`/api/v1/sales/${ids.sale}`])
    expect(save).not.toHaveBeenCalled()
  })

  it('404: la venta no existe o no está disponible, con el mismo texto que el 403 no distingue otra cuenta', async () => {
    serve({ sale: () => Promise.reject(failure(404, 'NOT_FOUND')) })
    render(<SaleDocumentDownloads saleId={ids.sale} />)
    await userEvent.setup().click(pdf())
    expect(await screen.findByRole('alert')).toHaveTextContent('La venta no existe o no está disponible para ti.')
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
  })

  it('configuración del emisor incompleta: nombra exactamente lo que falta y no consulta el servidor', async () => {
    vi.stubEnv('VITE_ISSUER_TAX_ID', '')
    render(<SaleDocumentDownloads saleId={ids.sale} />)
    await userEvent.setup().click(pdf())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('NIT')
    expect(alert).toHaveTextContent('VITE_ISSUER_TAX_ID')
    expect(alert).not.toHaveTextContent('VITE_ISSUER_LEGAL_NAME')
    expect(apiClient.request).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
  })

  it('cliente con respuesta malformada: falla sin ocultar la inconsistencia', async () => {
    serve({ customer: () => Promise.resolve(customerFixture({ name: '' })) })
    render(<SaleDocumentDownloads saleId={ids.sale} />)
    await userEvent.setup().click(pdf())
    expect(await screen.findByRole('alert')).toHaveTextContent('datos del cliente')
    expect(save).not.toHaveBeenCalled()
  })

  it('producto con respuesta malformada: falla sin inventar su nombre', async () => {
    serve({ product: () => Promise.resolve(productFixture({ name: '' })) })
    render(<SaleDocumentDownloads saleId={ids.sale} />)
    await userEvent.setup().click(pdf())
    expect(await screen.findByRole('alert')).toHaveTextContent('productos')
    expect(save).not.toHaveBeenCalled()
  })

  it.each(['customer', 'product'] as const)('un404 de %s permite descargar con procedencia no disponible explícita', async subject => {
    serve({ [subject]: () => Promise.reject(failure(404)) })
    render(<SaleDocumentDownloads saleId={ids.sale} />)
    await userEvent.setup().click(xml())
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    const model = render_.mock.calls[0][1]
    expect(subject === 'customer' ? model.customer.currentRecordAvailable : model.lines[0].currentRecordAvailable).toBe(false)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('venta con datos inconsistentes: falla explícitamente', async () => {
    serve({ sale: () => Promise.resolve(saleFixture({ totalCents: 1 })) })
    render(<SaleDocumentDownloads saleId={ids.sale} />)
    await userEvent.setup().click(pdf())
    expect(await screen.findByRole('alert')).toHaveTextContent('datos inconsistentes')
    expect(save).not.toHaveBeenCalled()
  })

  it('al iniciar otra descarga se limpian el error y el estado anteriores', async () => {
    let attempts = 0
    serve({ sale: () => (attempts += 1) === 1 ? Promise.reject(failure(500)) : Promise.resolve(saleFixture()) })
    render(<SaleDocumentDownloads saleId={ids.sale} />)
    const user = userEvent.setup()
    await user.click(pdf())
    await screen.findByRole('alert')
    await user.click(xml())
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    await screen.findByText('XML descargado.')
  })
})

describe('respuestas obsoletas y limpieza', () => {
  it('cambiar de venta durante la preparación cancela la anterior y descarta su respuesta tardía', async () => {
    const first = deferred()
    const signals: AbortSignal[] = []
    apiClient.request.mockReset().mockImplementation((path, options) => {
      if (options?.signal) signals.push(options.signal)
      if (path === `/api/v1/sales/${ids.sale}`) return first.promise
      if (path === '/api/v1/products/categories') return Promise.resolve(pageOf([]))
      if (path.startsWith('/api/v1/sales/')) return Promise.resolve(saleFixture({ saleId: otherSale }))
      if (path.startsWith('/api/v1/customers/')) return Promise.resolve(customerFixture())
      return Promise.resolve(productFixture())
    })
    const { rerender } = render(<SaleDocumentDownloads saleId={ids.sale} />)
    await userEvent.setup().click(pdf())
    expect(screen.getByRole('status')).toHaveTextContent('Preparando PDF…')
    rerender(<SaleDocumentDownloads saleId={otherSale} />)
    expect(signals[0].aborted).toBe(true)
    expect(screen.getByRole('status')).not.toHaveTextContent('Preparando')
    expect(pdf()).toBeEnabled()
    await act(async () => { first.resolve(saleFixture()); await Promise.resolve() })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(save).not.toHaveBeenCalled()
    expect(render_).not.toHaveBeenCalled()
    expect(screen.queryByText('PDF descargado.')).toBeNull()
    // The new sale downloads normally and is the one that is exported.
    await userEvent.setup().click(pdf())
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(save.mock.calls[0][1]).toBe(`comprobante-venta-${otherSale}.pdf`)
  })

  it('un error tardío de la venta anterior no aparece en la nueva', async () => {
    const first = deferred()
    serve({ sale: () => first.promise })
    const { rerender } = render(<SaleDocumentDownloads saleId={ids.sale} />)
    await userEvent.setup().click(pdf())
    serve()
    rerender(<SaleDocumentDownloads saleId={otherSale} />)
    await act(async () => { first.reject(failure(500)); await Promise.resolve() })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('desmontar durante la preparación cancela las peticiones y no descarga', async () => {
    const pending = deferred()
    const signals: AbortSignal[] = []
    apiClient.request.mockReset().mockImplementation((_path, options) => { if (options?.signal) signals.push(options.signal); return pending.promise })
    const { unmount } = render(<SaleDocumentDownloads saleId={ids.sale} />)
    await userEvent.setup().click(pdf())
    unmount()
    expect(signals.every((signal) => signal.aborted)).toBe(true)
    pending.resolve(saleFixture())
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(save).not.toHaveBeenCalled()
  })

  it('no descarga si la venta cambia justo mientras se genera el archivo', async () => {
    const generating = deferred<{ blob: Blob; fileName: string }>()
    render_.mockImplementationOnce(() => generating.promise)
    const { rerender } = render(<SaleDocumentDownloads saleId={ids.sale} />)
    await userEvent.setup().click(pdf())
    await waitFor(() => expect(render_).toHaveBeenCalled())
    rerender(<SaleDocumentDownloads saleId={otherSale} />)
    await act(async () => { generating.resolve({ blob: new Blob(['x']), fileName: 'viejo.pdf' }); await Promise.resolve() })
    expect(save).not.toHaveBeenCalled()
  })
})
