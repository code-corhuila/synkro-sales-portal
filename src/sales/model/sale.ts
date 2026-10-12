// Field names are the SaleResponse and SaleDetailResponse OpenAPI contract.
export interface SaleDetail {
  detailId: string
  productId: string
  quantity: number
  unitPriceCents: number
  subtotalCents: number
  active: boolean
}

export interface Sale {
  saleId: string
  customerId: string
  createdBy: string
  date: string
  totalCents: number
  active: boolean
  details: SaleDetail[]
}
