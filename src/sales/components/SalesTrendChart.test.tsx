import { render } from '@testing-library/react'
import { BarChart } from './SalesTrendChart'

const bars = (values: number[]) => values.map((value, index) => ({ key: `k${index}`, value }))

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
