import { useEffect, useId } from 'react'
import { redirectToSales, SALES_PATH } from '../../navigation'
import { Button } from '../components/Button'
import { PortalLink } from '../components/PortalLink'
import skeleton from '../components/Skeleton.module.css'
import table from '../components/SalesTable.module.css'
import { formatCents, formatDate } from '../model/formatting'
import type { Sale } from '../model/sale'
import { useSaleDetail, type Meta } from './useSaleDetail'
import styles from './SaleDetailPage.module.css'

const BackLink = () => <PortalLink href={SALES_PATH}>Volver al historial</PortalLink>
const Pending = () => <span aria-hidden="true" className={`${skeleton.skeleton} ${skeleton.text}`} />

function DetailError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const shared = error as { status?: number; body?: { traceId?: string } } | null
  const session = shared?.status === 401
  return <div role="alert" className={styles.alert}>
    <p className={styles.message}>{session ? 'La sesión ha finalizado. Vuelve a iniciar sesión desde SynkroTech.' : 'No se pudo cargar la venta.'}</p>
    {shared?.status === 0 && <p className={styles.message}>No se pudo conectar con el servidor. Inténtalo de nuevo.</p>}
    {shared?.body?.traceId && <p className={styles.message}>Referencia: {shared.body.traceId}</p>}
    {!session && <Button variant="secondary" onClick={onRetry}>Reintentar</Button>}
  </div>
}

function Lines({ sale, products }: { sale: Sale; products: Record<string, Meta<{ name: string }>> }) {
  return <div role="region" aria-label="Detalle de líneas" tabIndex={0} className={table.scroller}>
    <table className={table.table} aria-label="Líneas de la venta">
      <thead><tr>
        <th scope="col">Producto</th>
        <th scope="col" className={table.numericHeader}>Cantidad</th>
        <th scope="col" className={table.numericHeader}>Precio unitario</th>
        <th scope="col" className={table.numericHeader}>Subtotal</th>
      </tr></thead>
      <tbody>
        {sale.details.map((line) => {
          const product = products[line.productId]
          return <tr key={line.detailId}>
            {/* A missing name is never invented: the stored identifier stays. */}
            <td className={product?.status === 'ready' ? undefined : table.identifier}>
              {product?.status === 'ready' ? product.value.name : product?.status === 'unavailable' ? line.productId : <Pending />}
            </td>
            <td className={table.numeric}>{line.quantity}</td>
            <td className={table.numeric}>{formatCents(line.unitPriceCents)}</td>
            <td className={table.numeric}>{formatCents(line.subtotalCents)}</td>
          </tr>
        })}
      </tbody>
    </table>
  </div>
}

export function SaleDetailPage({ saleId }: { saleId: string }) {
  const detail = useSaleDetail(saleId)
  const title = useId()
  const state = detail.sale.status
  useEffect(() => { if (state === 'forbidden') redirectToSales('forbidden') }, [state])

  const header = <header className={styles.header}>
    <h1 id={title} className={styles.title}>Detalle de venta</h1>
    <BackLink />
  </header>

  if (detail.sale.status === 'notFound') {
    return <section className={styles.page}>
      <div className={styles.empty}>
        <h1 className={styles.title}>Venta no encontrada</h1>
        <p className={styles.message}>No existe una venta con ese identificador o no está disponible para ti.</p>
        <BackLink />
      </div>
    </section>
  }
  if (detail.sale.status === 'error') {
    return <section className={styles.page} aria-labelledby={title}>{header}<DetailError error={detail.sale.error} onRetry={detail.retry} /></section>
  }
  if (detail.sale.status !== 'ready') {
    return <section className={styles.page} aria-labelledby={title} aria-busy="true">
      {header}
      <p role="status">Cargando venta…</p>
      <div className={styles.card} aria-hidden="true"><Pending /><Pending /></div>
      <div className={styles.card} aria-hidden="true"><Pending /></div>
      <div className={styles.card} aria-hidden="true"><Pending /><Pending /><Pending /></div>
    </section>
  }

  const sale = detail.sale.value
  const { customer, products } = detail
  const productsFailed = Object.values(products).some((entry) => entry.status === 'unavailable')
  return <section className={styles.page} aria-labelledby={title}>
    {header}
    {!sale.active && <p className={styles.message}>Esta venta está anulada.</p>}
    {detail.metadataFailed && <div role="status" aria-label="Aviso de datos incompletos" className={styles.partial}>
      {customer.status === 'unavailable' && <p className={styles.message}>No se pudo cargar la información del cliente. Se muestra el identificador guardado.</p>}
      {productsFailed && <p className={styles.message}>No se pudo cargar la información de uno o más productos. Se muestran los identificadores guardados.</p>}
      <Button variant="secondary" size="small" onClick={detail.retryMetadata}>Reintentar información</Button>
    </div>}
    <section className={styles.card} aria-label="Resumen de la venta">
      <dl className={styles.facts}>
        <div className={styles.fact}><dt>Venta</dt><dd className={styles.mono}>{sale.saleId}</dd></div>
        <div className={styles.fact}><dt>Fecha</dt><dd className={styles.numeric}><time dateTime={sale.date}>{formatDate(sale.date)}</time></dd></div>
        <div className={styles.fact}><dt>Total de la venta</dt><dd className={`${styles.numeric} ${styles.total}`}>{formatCents(sale.totalCents)}</dd></div>
      </dl>
    </section>
    <section className={styles.card} aria-labelledby={`${title}-customer`}>
      <h2 id={`${title}-customer`} className={styles.sectionTitle}>Cliente</h2>
      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>Nombre</dt>
          <dd>{customer.status === 'ready' ? customer.value.name : customer.status === 'unavailable' ? <span className={styles.mono}>{sale.customerId}</span> : <Pending />}</dd>
        </div>
        {customer.status === 'ready' && <div className={styles.fact}><dt>Documento de identidad</dt><dd className={styles.numeric}>{customer.value.identityDocument}</dd></div>}
      </dl>
    </section>
    <section className={styles.card} aria-labelledby={`${title}-lines`}>
      <h2 id={`${title}-lines`} className={styles.sectionTitle}>Líneas</h2>
      <Lines sale={sale} products={products} />
    </section>
  </section>
}
