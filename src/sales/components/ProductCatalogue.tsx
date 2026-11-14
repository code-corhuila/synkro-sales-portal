import { useEffect, useId, type Ref } from 'react'
import { listAllCategories } from '../api/productsApi'
import { stockBadge } from '../model/cart'
import type { Category } from '../model/category'
import { formatCents } from '../model/formatting'
import type { Product } from '../model/product'
import { Button } from './Button'
import styles from './Catalogue.module.css'
import field from './Field.module.css'
import { useCatalogue } from './useCatalogue'
import { useSearch } from './useSearch'

interface Props {
  disabled?: boolean
  onAdd: (product: Product) => void
  filterRef?: Ref<HTMLInputElement>
  // Polite, brief confirmation after an add (set by the owner of the cart).
  announcement: string
}

export function ProductCatalogue({ disabled, onAdd, filterRef, announcement }: Props) {
  const id = useId()
  const catalogue = useCatalogue()
  const categories = useSearch<Category[]>((_term, signal) => listAllCategories({ signal }))
  const loadCategories = categories.search
  useEffect(() => { loadCategories('') }, [loadCategories])
  const { state, products } = catalogue
  const selected = catalogue.categoryId

  return <section aria-label="Catálogo de productos" className={styles.panel}>
    <h3 className={styles.heading}>Catálogo</h3>
    <div className={field.field}>
      <label className={field.label} htmlFor={`${id}-filter`}>Buscar producto</label>
      <input id={`${id}-filter`} ref={filterRef} type="search" autoComplete="off" value={catalogue.name} maxLength={80}
        onChange={(event) => catalogue.setName(event.target.value)} />
    </div>
    <div role="group" aria-label="Categorías" className={styles.chips}>
      <button type="button" className={styles.chip} aria-pressed={selected === ''} onClick={() => catalogue.setCategoryId('')}>Todas</button>
      {categories.state.status === 'ready' && categories.state.value.filter((category) => category.active).map((category) =>
        <button key={category.categoryId} type="button" className={styles.chip} aria-pressed={selected === category.categoryId}
          onClick={() => catalogue.setCategoryId(category.categoryId)}>{category.name}</button>)}
    </div>
    {categories.state.status === 'error' && <p role="alert" className={styles.errorNote}>
      No se pudieron cargar las categorías. <Button variant="ghost" size="small" onClick={() => loadCategories('')}>Reintentar categorías</Button>
    </p>}
    <p className={styles.live} role="status" aria-live="polite">{announcement}</p>

    {state.status === 'loading' && <p role="status" className={styles.note}>Cargando productos…</p>}
    {state.status === 'error' && <div role="alert" className={styles.errorNote}>
      No se pudo cargar el catálogo. <Button variant="secondary" size="small" onClick={catalogue.retry}>Reintentar</Button>
    </div>}
    {state.status === 'ready' && products.length === 0 && <p role="status" className={styles.note}>No hay productos que coincidan con la búsqueda.</p>}
    {products.length > 0 && <ul className={styles.grid} aria-label="Productos">
      {products.map((product) => {
        const badge = stockBadge(product.stock)
        return <li key={product.productId}>
          <button type="button" className={styles.tile} disabled={disabled || badge.kind === 'out'} onClick={() => onAdd(product)}
            aria-label={`Agregar ${product.name}, ${formatCents(product.priceCents)}, ${badge.label}`}>
            <span className={styles.tileName}>{product.name}</span>
            <span className={styles.price}>{formatCents(product.priceCents)}</span>
            <span className={`${styles.badge} ${styles[badge.kind]}`}>{badge.label}</span>
          </button>
        </li>
      })}
    </ul>}
    {catalogue.hasMore && <Button variant="secondary" onClick={catalogue.loadMore} disabled={catalogue.loadingMore}>
      {catalogue.loadingMore ? 'Cargando…' : `Mostrar más productos (${products.length} de ${catalogue.total})`}
    </Button>}
  </section>
}
