// Field names are the ProductResponse OpenAPI contract (synkro-products-api).
export interface Product {
  productId: string
  name: string
  priceCents: number
  stock: number
  categoryId: string
  active: boolean
}
