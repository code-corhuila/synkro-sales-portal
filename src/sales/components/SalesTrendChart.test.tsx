import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BarChart, RankingBars } from './SalesTrendChart'

const bars = (values: number[]) => values.map((value, index) => ({ key: `k${index}`, value }))

describe('BarChart', () => {
  it('un bar por fila, sin alto negativo ni NaN para un valor en cero', () => {
    const { container } = render(<BarChart bars={bars([100, 0, 50])} caption="x" />)
    const rects = container.querySelectorAll('rect')
    expect(rects).toHaveLength(3)
    for (const rect of rects) {
      const height = Number(rect.getAttribute('height'))
      expect(Number.isFinite(height)).toBe(true)
      expect(height).toBeGreaterThanOrEqual(0)
    }
    expect(Number(rects[1].getAttribute('height'))).toBe(0)
  })

  it('sin datos no dibuja nada', () => {
    const { container } = render(<BarChart bars={[]} caption="x" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('es decorativo: la tabla reusada es la única fuente accesible', () => {
    const { container } = render(<BarChart bars={bars([1, 2])} caption="Totales diarios de ventas" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg?.querySelector('desc')?.textContent).toBe('Totales diarios de ventas')
  })

  it('lee de entrada el punto más reciente y permite elegir otro con el mouse o el teclado', async () => {
    const user = userEvent.setup()
    const points = [
      { key: '2026-10-11', value: 500, label: '11 oct', detail: '1 venta' },
      { key: '2026-10-12', value: 123456789, label: '12 oct', detail: '3 ventas' },
    ]
    render(<BarChart bars={points} caption="Totales diarios de ventas" format={(value) => `$${value}`} />)
    const readout = screen.getByRole('status')
    expect(readout).toHaveTextContent('12 oct')
    expect(readout).toHaveTextContent('$123456789')
    expect(readout).toHaveTextContent('3 ventas')

    const firstPoint = screen.getByRole('button', { name: '11 oct' })
    expect(firstPoint).toHaveAttribute('aria-pressed', 'false')
    await user.click(firstPoint)
    expect(readout).toHaveTextContent('$500')
    expect(readout).toHaveTextContent('1 venta')
    expect(firstPoint).toHaveAttribute('aria-pressed', 'true')

    firstPoint.focus()
    await user.keyboard('{Enter}')
    expect(firstPoint).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('RankingBars', () => {
  it('un elemento por fila, con ancho de barra nunca negativo ni NaN para un valor en cero', () => {
    const { container } = render(<RankingBars bars={bars([100, 0, 50])} />)
    const items = container.querySelectorAll('li')
    expect(items).toHaveLength(3)
    const fills = container.querySelectorAll('[style]')
    for (const fill of fills) {
      const width = Number.parseFloat((fill as HTMLElement).style.width)
      expect(Number.isFinite(width)).toBe(true)
      expect(width).toBeGreaterThanOrEqual(0)
      expect(width).toBeLessThanOrEqual(100)
    }
  })

  it('un máximo en cero no produce NaN ni un ancho negativo', () => {
    const { container } = render(<RankingBars bars={bars([0, 0])} />)
    const fills = container.querySelectorAll('li > div > div')
    for (const fill of fills) expect((fill as HTMLElement).style.width).toBe('0%')
  })

  it('sin datos no dibuja nada', () => {
    const { container } = render(<RankingBars bars={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('es decorativo: la tabla reusada es la única fuente accesible', () => {
    const { container } = render(<RankingBars bars={bars([1, 2])} />)
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  })
})
